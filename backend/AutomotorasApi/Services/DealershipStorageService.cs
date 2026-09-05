using AutomotorasApi.Models;
using Azure;
using Azure.Data.Tables;
using System.Security.Cryptography;

namespace AutomotorasApi.Services;

public class DealershipStorageService
{
    private readonly TableClient _tableClient;
    private const string TableName = "Dealerships";
    private const string Pk = "dealership";
    private const int MaxDealershipsForPlus = 10;

    public DealershipStorageService(TableServiceClient tableServiceClient)
    {
        _tableClient = tableServiceClient.GetTableClient(TableName);
        _tableClient.CreateIfNotExists();
    }

    public async Task<IEnumerable<DealershipEntity>> GetAllAsync()
    {
        var list = new List<DealershipEntity>();
        await foreach (var d in _tableClient.QueryAsync<DealershipEntity>(d => d.PartitionKey == Pk))
        {
            if (!d.IsLoginEmailIndex) list.Add(d);
        }
        return list;
    }

    /// <summary>
    /// Returns only root accounts which currently have a locally authorized
    /// subscription to reconcile. Branches, index rows and inactive records are
    /// deliberately excluded before any payment-provider request is made.
    /// </summary>
    public virtual async Task<IEnumerable<DealershipEntity>> GetAuthorizedRootSubscriptionsAsync()
    {
        var accounts = new List<DealershipEntity>();
        await foreach (var dealership in _tableClient.QueryAsync<DealershipEntity>(d =>
            d.PartitionKey == Pk && d.SubscriptionStatus == "authorized" && d.SubscriptionId != string.Empty))
        {
            if (dealership.IsLoginEmailIndex ||
                !string.Equals(dealership.SubscriptionStatus, "authorized", StringComparison.Ordinal) ||
                !IsRootAccount(dealership, dealership.RowKey) ||
                !SubscriptionCatalog.IsSupportedPlan(dealership.Plan) ||
                string.IsNullOrWhiteSpace(dealership.SubscriptionId))
                continue;

            accounts.Add(dealership);
        }

        return accounts;
    }

    /// <summary>
    /// Returns the canonical billing/account identifier for a dealership. An
    /// absent owner is a legacy root account, rather than an orphaned branch.
    /// </summary>
    public static string GetAccountId(DealershipEntity dealership)
    {
        ArgumentNullException.ThrowIfNull(dealership);
        return string.IsNullOrWhiteSpace(dealership.OwnerAccountId)
            ? dealership.RowKey
            : dealership.OwnerAccountId;
    }

    /// <summary>
    /// The address used for authentication. Older root rows only have Email,
    /// so that value remains a read-only compatibility fallback.
    /// </summary>
    public static string GetLoginEmail(DealershipEntity dealership)
    {
        ArgumentNullException.ThrowIfNull(dealership);
        return string.IsNullOrWhiteSpace(dealership.LoginEmail)
            ? dealership.Email
            : dealership.LoginEmail;
    }

    public virtual async Task<DealershipEntity?> GetByIdAsync(string id)
    {
        try
        {
            var response = await _tableClient.GetEntityAsync<DealershipEntity>(Pk, id);
            return response.Value.IsLoginEmailIndex ? null : response.Value;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    /// <summary>
    /// Gets the root dealership and every branch belonging to one account.
    /// The direct root read is necessary for legacy rows, whose owner field is
    /// empty and therefore cannot be selected by an OwnerAccountId filter.
    /// </summary>
    public virtual async Task<IEnumerable<DealershipEntity>> GetByOwnerAccountIdAsync(string accountId)
    {
        if (string.IsNullOrWhiteSpace(accountId)) return Array.Empty<DealershipEntity>();

        var dealerships = new Dictionary<string, DealershipEntity>(StringComparer.Ordinal);
        var root = await GetByIdAsync(accountId);
        if (root is not null && string.Equals(GetAccountId(root), accountId, StringComparison.Ordinal))
            dealerships[root.RowKey] = root;

        await foreach (var dealership in _tableClient.QueryAsync<DealershipEntity>(d =>
            d.PartitionKey == Pk && d.OwnerAccountId == accountId))
        {
            if (!dealership.IsLoginEmailIndex &&
                string.Equals(GetAccountId(dealership), accountId, StringComparison.Ordinal))
                dealerships[dealership.RowKey] = dealership;
        }

        return dealerships.Values.ToList();
    }

    private async Task<int> GetManagedDealershipCountAsync(DealershipEntity rootAccount)
    {
        if (rootAccount.ManagedDealershipCount >= 1)
            return rootAccount.ManagedDealershipCount;

        // Existing accounts predate the durable counter. Establish their
        // baseline from rows once; branch creation then records it under ETag.
        return Math.Max(1, (await GetByOwnerAccountIdAsync(rootAccount.RowKey)).Count());
    }

    public async Task<DealershipEntity> CreateAsync(CreateDealershipRequest request)
    {
        var id = Guid.NewGuid().ToString();
        var entity = new DealershipEntity
        {
            RowKey = id,
            OwnerAccountId = id,
            ManagedDealershipCount = 1,
            Name = request.Name,
            Address = request.Address,
            City = request.City,
            Country = request.Country,
            Phone = request.Phone,
            Email = request.Email,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
        };

        await _tableClient.AddEntityAsync(entity);
        return entity;
    }

    /// <summary>
    /// Creates a public branch under an existing root account. The account,
    /// not the browser request, owns the relationship and commercial limit.
    /// </summary>
    public async Task<DealershipEntity> CreateBranchAsync(string accountId, CreateDealershipRequest request)
    {
        if (string.IsNullOrWhiteSpace(accountId))
            throw new ApiException(400, "account_required", "La cuenta es obligatoria.");

        var account = await GetByIdAsync(accountId);
        if (account is null || !IsRootAccount(account, accountId))
            throw new ApiException(404, "account_not_found", "La cuenta propietaria no existe.");

        if (!string.Equals(account.Plan, "plus", StringComparison.Ordinal) ||
            !string.Equals(account.SubscriptionStatus, "authorized", StringComparison.Ordinal))
        {
            throw new ApiException(403, "branches_plan_required",
                "NecesitÃ¡s un Plan Plus activo para crear sucursales.");
        }

        var dealerships = await GetByOwnerAccountIdAsync(accountId);
        if (dealerships.Count() >= MaxDealershipsForPlus)
        {
            throw new ApiException(409, "branch_limit_reached",
                $"El Plan Plus permite hasta {MaxDealershipsForPlus} sucursales.");
        }

        var entity = new DealershipEntity
        {
            RowKey = Guid.NewGuid().ToString(),
            OwnerAccountId = accountId,
            Name = request.Name,
            Address = request.Address,
            City = request.City,
            Country = request.Country,
            Phone = request.Phone,
            Email = request.Email,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
        };

        // Reserve the final slot with the root ETag and create the branch in
        // one same-partition transaction. The earlier read gives quick errors;
        // this transaction is the concurrency authority.
        return await TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var currentAccount = await GetByIdAsync(accountId);
            if (currentAccount is null || !IsRootAccount(currentAccount, accountId))
                throw new ApiException(404, "account_not_found", "La cuenta propietaria no existe.");

            if (!string.Equals(currentAccount.Plan, "plus", StringComparison.Ordinal) ||
                !string.Equals(currentAccount.SubscriptionStatus, "authorized", StringComparison.Ordinal))
                throw new ApiException(403, "branches_plan_required", "Se requiere un Plan Plus activo para crear sucursales.");

            if (string.Equals(currentAccount.CheckoutPlan, "basic", StringComparison.Ordinal) ||
                string.Equals(currentAccount.PendingPlan, "basic", StringComparison.Ordinal))
                throw new ApiException(409, "downgrade_in_progress",
                    "No se pueden crear sucursales mientras se procesa un cambio al plan Basic.");

            var managedCount = currentAccount.ManagedDealershipCount;
            if (managedCount < 1)
                managedCount = (await GetByOwnerAccountIdAsync(accountId)).Count();
            managedCount = Math.Max(1, managedCount);
            if (managedCount >= MaxDealershipsForPlus)
                throw new ApiException(409, "branch_limit_reached",
                    $"El Plan Plus permite hasta {MaxDealershipsForPlus} sucursales.");

            currentAccount.ManagedDealershipCount = managedCount + 1;
            await _tableClient.SubmitTransactionAsync(new[]
            {
                new TableTransactionAction(TableTransactionActionType.UpdateMerge, currentAccount, currentAccount.ETag),
                new TableTransactionAction(TableTransactionActionType.Add, entity),
            });
            return entity;
        });
    }

    public async Task<DealershipEntity?> UpdateAsync(string id, UpdateDealershipRequest request)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return null;

        existing.Name = request.Name;
        existing.Address = request.Address;
        existing.City = request.City;
        existing.Country = request.Country;
        existing.Phone = request.Phone;
        // Email is public contact data. LoginEmail can only change through an
        // account-security flow, never through this profile update.
        // Materialize the legacy fallback before replacing Email; otherwise a
        // contact-only edit would silently move a legacy account's login.
        if (string.IsNullOrWhiteSpace(existing.LoginEmail)) existing.LoginEmail = existing.Email;
        existing.Email = request.Email;
        existing.Latitude = request.Latitude;
        existing.Longitude = request.Longitude;
        existing.Bio = request.Bio;
        existing.BusinessHours = request.BusinessHours;
        existing.Instagram = request.Instagram;
        existing.TikTok = request.TikTok;
        existing.Website = UrlPolicy.NormalizeOptionalHttpsUrl(request.Website, "website_invalid",
            "El sitio web debe ser una URL HTTPS valida.");

        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return existing;
    }

    public async Task<bool> UpdateLogoUrlAsync(string id, string logoUrl)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return false;

        existing.LogoUrl = logoUrl;
        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    public async Task<int> DeleteAllAsync()
    {
        var all = (await GetAllAsync()).ToList();
        foreach (var d in all)
            await _tableClient.DeleteEntityAsync(d.PartitionKey, d.RowKey);
        return all.Count;
    }

    public static DealershipDto ToDto(DealershipEntity e) =>
        new(e.RowKey, e.Name, e.Address, e.City, e.Country, e.Phone, e.Email, e.LogoUrl,
            e.Latitude, e.Longitude, e.Bio, e.BusinessHours, e.Instagram, e.TikTok,
            UrlPolicy.SafeHttpsUrlOrEmpty(e.Website));

    /// <summary>
    /// Projects a dealership for its owning account's dashboard. Subscription
    /// state is always read from the root account so selecting a branch cannot
    /// accidentally gate the UI using stale branch-local values.
    /// </summary>
    public static AdminDealershipDto ToAdminDto(DealershipEntity dealership, DealershipEntity account) =>
        new(dealership.RowKey, dealership.Name, dealership.Address, dealership.City, dealership.Country,
            dealership.Phone, dealership.Email, dealership.LogoUrl, dealership.Latitude, dealership.Longitude,
            account.Plan, account.SubscriptionStatus, dealership.Bio, dealership.BusinessHours,
            dealership.Instagram, dealership.TikTok, UrlPolicy.SafeHttpsUrlOrEmpty(dealership.Website), dealership.ProfileViews,
            dealership.ProfileViewsThisMonth, dealership.ProfileViewsHistoryJson, GetAccountId(dealership));

    public static AdminDealershipDto ToAdminDto(DealershipEntity dealership) =>
        ToAdminDto(dealership, dealership);

    public async Task<bool> UpdatePlanAsync(string id, string plan, string subscriptionId, string status)
    {
        var normalizedStatus = SubscriptionState.NormalizeStatus(status);
        if (!SubscriptionCatalog.IsSupportedPlan(plan) || normalizedStatus is null)
            return false;

        return await TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var existing = await GetByIdAsync(id);
            if (existing is null || !IsRootAccount(existing, id)) return false;

            existing.Plan = plan;
            existing.SubscriptionId = string.IsNullOrWhiteSpace(subscriptionId) ? existing.SubscriptionId : subscriptionId;
            existing.SubscriptionStatus = normalizedStatus;
            existing.SubscriptionProviderVersion = -1;
            // Clear pending upgrade once the active plan is confirmed.
            existing.PendingPlan = string.Empty;
            existing.PendingSubscriptionId = string.Empty;
            existing.PendingSubscriptionProviderVersion = -1;

            await _tableClient.UpdateEntityAsync(existing, existing.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    public async Task<bool> SavePendingCheckoutAsync(string id, string pendingPlan, string pendingSubscriptionId)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null || !IsRootAccount(existing, id) ||
            !SubscriptionCatalog.IsSupportedPlan(pendingPlan) || string.IsNullOrWhiteSpace(pendingSubscriptionId))
            return false;

        existing.PendingPlan = pendingPlan;
        existing.PendingSubscriptionId = pendingSubscriptionId;
        existing.PendingSubscriptionProviderVersion = -1;

        await _tableClient.UpdateEntityAsync(existing, existing.ETag, TableUpdateMode.Merge);
        return true;
    }

    public async Task<bool> ClearPendingAsync(string id)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null || !IsRootAccount(existing, id)) return false;

        existing.PendingPlan = string.Empty;
        existing.PendingSubscriptionId = string.Empty;
        existing.PendingSubscriptionProviderVersion = -1;

        await _tableClient.UpdateEntityAsync(existing, existing.ETag, TableUpdateMode.Merge);
        return true;
    }

    /// <summary>
    /// Atomically reserves one checkout attempt before any request reaches the
    /// payment provider. A reservation is intentionally not time-expired: a
    /// timeout may still have created a billable remote preapproval.
    /// </summary>
    public async Task<CheckoutReservation?> TryBeginCheckoutAsync(string accountId, string plan)
    {
        if (string.IsNullOrWhiteSpace(accountId) || !SubscriptionCatalog.IsSupportedPlan(plan)) return null;

        return await TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var account = await GetByIdAsync(accountId);
            if (account is null || !IsRootAccount(account, accountId))
                return null;

            if (string.Equals(plan, "basic", StringComparison.Ordinal) &&
                await GetManagedDealershipCountAsync(account) > 1)
                throw new ApiException(409, "downgrade_branches_exist",
                    "No podés cambiar al plan Basic mientras existan sucursales adicionales.");

            if (!string.IsNullOrWhiteSpace(account.PendingSubscriptionId) ||
                !string.IsNullOrWhiteSpace(account.PendingPlan) ||
                !string.IsNullOrWhiteSpace(account.CheckoutAttemptId) ||
                !string.IsNullOrWhiteSpace(account.SupersededSubscriptionId) ||
                HasUnresolvedLegacySubscription(account))
                return null;

            var attemptId = Guid.NewGuid().ToString("N");
            account.CheckoutAttemptId = attemptId;
            account.CheckoutPlan = plan;
            account.CheckoutStartedAt = DateTimeOffset.UtcNow;
            await _tableClient.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge);
            return new CheckoutReservation(accountId, plan, attemptId);
        });
    }

    /// <summary>
    /// Converts only the matching pre-provider reservation into a real pending
    /// subscription. A late provider result can never overwrite a newer attempt.
    /// </summary>
    public async Task<bool> CompletePendingCheckoutAsync(
        string accountId, string attemptId, string pendingSubscriptionId)
    {
        if (string.IsNullOrWhiteSpace(accountId) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(attemptId, out var normalizedAttempt) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(pendingSubscriptionId, out var normalizedSubscriptionId))
            return false;

        return await TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var account = await GetByIdAsync(accountId);
            if (account is null || !IsRootAccount(account, accountId)) return false;

            if (!SubscriptionState.SameId(account.CheckoutAttemptId, normalizedAttempt))
            {
                // A signed webhook may have adopted this exact reservation before
                // the original HTTP POST response reached us.
                return SubscriptionState.SameId(account.PendingSubscriptionId, normalizedSubscriptionId) ||
                    SubscriptionState.SameId(account.SubscriptionId, normalizedSubscriptionId);
            }

            if (!SubscriptionCatalog.IsSupportedPlan(account.CheckoutPlan) ||
                !string.IsNullOrWhiteSpace(account.PendingSubscriptionId))
                return false;

            account.PendingPlan = account.CheckoutPlan;
            account.PendingSubscriptionId = normalizedSubscriptionId;
            account.PendingSubscriptionProviderVersion = -1;
            ClearCheckoutReservation(account);
            await _tableClient.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    /// <summary>Only a definite provider rejection may release a reservation.</summary>
    public async Task<bool> ReleaseCheckoutReservationAsync(string accountId, string attemptId)
    {
        if (string.IsNullOrWhiteSpace(accountId) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(attemptId, out var normalizedAttempt))
            return false;

        return await TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var account = await GetByIdAsync(accountId);
            if (account is null || !IsRootAccount(account, accountId) ||
                !SubscriptionState.SameId(account.CheckoutAttemptId, normalizedAttempt))
                return false;

            ClearCheckoutReservation(account);
            await _tableClient.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    public virtual async Task<bool> ClearSupersededSubscriptionAsync(string accountId, string subscriptionId)
    {
        if (string.IsNullOrWhiteSpace(accountId) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(subscriptionId, out var normalizedSubscriptionId))
            return false;

        return await TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var account = await GetByIdAsync(accountId);
            if (account is null || !IsRootAccount(account, accountId) ||
                !SubscriptionState.SameId(account.SupersededSubscriptionId, normalizedSubscriptionId))
                return false;

            account.SupersededSubscriptionId = string.Empty;
            await _tableClient.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    /// <summary>
    /// Applies a provider-validated subscription snapshot to the root account.
    /// The root is re-read for every ETag attempt so duplicate, obsolete and
    /// racing notifications are evaluated against the latest durable state.
    /// </summary>
    public virtual async Task<bool> ApplySubscriptionAsync(
        string accountId, string plan, string subscriptionId, string status, string checkoutAttemptId = "",
        long providerVersion = -1)
    {
        if (string.IsNullOrWhiteSpace(accountId)) return false;

        return await TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var account = await GetByIdAsync(accountId);
            if (account is null || !IsRootAccount(account, accountId)) return false;

            var previousPlan = account.Plan;
            var state = new SubscriptionState(accountId, plan, subscriptionId, status,
                CheckoutAttemptId: checkoutAttemptId, ProviderVersion: providerVersion);
            if (!state.TryApplyTo(account)) return false;

            // TryBeginCheckoutAsync blocks ordinary downgrades before Mercado
            // Pago is contacted. Keep the same invariant at the asynchronous
            // provider boundary as well: legacy/in-flight data must never let a
            // later webhook promote Basic while the account already has branches.
            // This check happens inside the ETag retry so a concurrent branch
            // reservation causes the subscription write to retry and re-check.
            if (string.Equals(account.Plan, "basic", StringComparison.Ordinal) &&
                !string.Equals(previousPlan, "basic", StringComparison.Ordinal) &&
                await GetManagedDealershipCountAsync(account) > 1)
            {
                throw new ApiException(409, "downgrade_branches_exist",
                    "No podés cambiar al plan Basic mientras existan sucursales adicionales.");
            }

            await _tableClient.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    private static bool HasUnresolvedLegacySubscription(DealershipEntity account)
    {
        if (string.IsNullOrWhiteSpace(account.SubscriptionId)) return false;

        // Older deployments stored a first checkout directly in SubscriptionId
        // with pending/paused status. Starting a second checkout would orphan the
        // first recurring authorization; unknown values fail closed as well.
        return SubscriptionState.NormalizeStatus(account.SubscriptionStatus) is not
            ("authorized" or "canceled" or "rejected" or "failed");
    }

    private static void ClearCheckoutReservation(DealershipEntity account)
    {
        account.CheckoutAttemptId = string.Empty;
        account.CheckoutPlan = string.Empty;
        account.CheckoutStartedAt = null;
    }

    public async Task<bool> TrackProfileVisitAsync(string id)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return false;

        var monthKey = DateTime.UtcNow.ToString("yyyy-MM");
        if (existing.ProfileViewsMonthKey != monthKey)
        {
            existing.ProfileViewsThisMonth = 0;
            existing.ProfileViewsMonthKey = monthKey;
        }
        existing.ProfileViews++;
        existing.ProfileViewsThisMonth++;

        // Update monthly history JSON
        var history = new System.Collections.Generic.Dictionary<string, int>();
        if (!string.IsNullOrEmpty(existing.ProfileViewsHistoryJson))
        {
            try
            {
                history = System.Text.Json.JsonSerializer.Deserialize<System.Collections.Generic.Dictionary<string, int>>(existing.ProfileViewsHistoryJson)
                    ?? new();
            }
            catch { }
        }
        history[monthKey] = history.TryGetValue(monthKey, out var prev) ? prev + 1 : 1;
        // Keep only last 12 months
        if (history.Count > 12)
        {
            var oldest = history.Keys.OrderBy(k => k).First();
            history.Remove(oldest);
        }
        existing.ProfileViewsHistoryJson = System.Text.Json.JsonSerializer.Serialize(history);

        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    /// <summary>
    /// Compatibility name used by the authentication flow. It resolves the
    /// private login address, not a branch's public contact address.
    /// </summary>
    public virtual Task<DealershipEntity?> GetByEmailAsync(string email) => GetByLoginEmailAsync(email);

    public virtual async Task<DealershipEntity?> GetByLoginEmailAsync(string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;

        var requestedEmail = email.Trim();
        var indexRowKey = CreateLoginEmailIndexRowKey(requestedEmail);
        try
        {
            var index = (await _tableClient.GetEntityAsync<DealershipEntity>(Pk, indexRowKey)).Value;
            if (index.IsLoginEmailIndex && !string.IsNullOrWhiteSpace(index.IndexedAccountId))
            {
                var indexedAccount = await GetByIdAsync(index.IndexedAccountId);
                if (indexedAccount is not null &&
                    string.Equals(GetLoginEmail(indexedAccount), requestedEmail, StringComparison.OrdinalIgnoreCase))
                    return indexedAccount;
            }
        }
        catch (RequestFailedException exception) when (exception.Status == 404)
        {
            // Legacy accounts have no index yet; scan them below for backwards
            // compatibility and to prevent a new duplicate registration.
        }

        // Azure Tables equality filters are case-sensitive. Scanning this small
        // account table keeps email lookup case-insensitive and lets old rows
        // fall back from an absent LoginEmail to their former Email field.
        await foreach (var dealership in _tableClient.QueryAsync<DealershipEntity>(d => d.PartitionKey == Pk))
        {
            if (dealership.IsLoginEmailIndex || !IsRootAccount(dealership, dealership.RowKey)) continue;
            if (string.Equals(GetLoginEmail(dealership), requestedEmail, StringComparison.OrdinalIgnoreCase))
                return dealership;
        }
        return null;
    }

    public async Task<(DealershipEntity entity, bool emailExists)> RegisterWithCredentialsAsync(RegisterRequest request)
    {
        var existing = await GetByLoginEmailAsync(request.Email);
        if (existing is not null)
            return (null!, true);

        var token = GenerateSecureToken();
        var id = Guid.NewGuid().ToString();
        var entity = new DealershipEntity
        {
            RowKey = id,
            OwnerAccountId = id,
            ManagedDealershipCount = 1,
            Name = request.Name,
            // A newly registered account starts with the same public contact
            // and login address, then they can evolve independently.
            Email = request.Email,
            LoginEmail = request.Email,
            Phone = request.Phone,
            Address = request.Address,
            City = request.City,
            Country = request.Country,
            Plan = "basic",
            // No password is retained before the email-link proof. This
            // prevents an address pre-registered by somebody else from
            // becoming usable with the registrant's chosen password.
            PasswordHash = string.Empty,
            PasswordSalt = string.Empty,
            IsEmailVerified = false,
            EmailVerificationToken = token,
            EmailVerificationTokenExpiry = DateTimeOffset.UtcNow.AddHours(24),
        };
        var emailIndex = new DealershipEntity
        {
            RowKey = CreateLoginEmailIndexRowKey(request.Email),
            IsLoginEmailIndex = true,
            IndexedAccountId = id,
        };

        try
        {
            // A random account RowKey alone cannot enforce uniqueness. The
            // deterministic index is added in the same partition transaction,
            // so exactly one concurrent registration can reserve this address.
            await _tableClient.SubmitTransactionAsync(new[]
            {
                new TableTransactionAction(TableTransactionActionType.Add, entity),
                new TableTransactionAction(TableTransactionActionType.Add, emailIndex),
            });
            return (entity, false);
        }
        catch (RequestFailedException exception) when (exception.Status == 409)
        {
            return (null!, true);
        }
    }

    /// <summary>
    /// Regenerates the verification token for an unverified root account. The
    /// lookup intentionally uses LoginEmail so changing public contact data
    /// cannot redirect account-verification mail.
    /// </summary>
    public async Task<DealershipEntity?> SetEmailVerificationTokenAsync(string email)
    {
        var entity = await GetByLoginEmailAsync(email);
        if (entity is null || entity.IsEmailVerified) return null;

        entity.EmailVerificationToken = GenerateSecureToken();
        entity.EmailVerificationTokenExpiry = DateTimeOffset.UtcNow.AddHours(24);
        await _tableClient.UpdateEntityAsync(entity, entity.ETag, TableUpdateMode.Merge);
        return entity;
    }

    /// <summary>
    /// Verifies ownership of a newly registered login address and turns that
    /// one-time verification capability into a one-time password-setup
    /// capability. The password supplied before proving email ownership is
    /// deliberately discarded: otherwise a pre-registered address could be
    /// verified later by its real owner while retaining an attacker's password.
    /// </summary>
    public async Task<DealershipEntity?> VerifyEmailAndStartPasswordSetupAsync(string token)
    {
        await foreach (var d in _tableClient.QueryAsync<DealershipEntity>(d =>
            d.PartitionKey == Pk && d.EmailVerificationToken == token))
        {
            if (!IsRootAccount(d, d.RowKey)) continue;
            if (d.IsEmailVerified) return null;
            if (d.EmailVerificationTokenExpiry is null || d.EmailVerificationTokenExpiry < DateTimeOffset.UtcNow)
                return null;
            d.IsEmailVerified = true;
            d.EmailVerificationToken = string.Empty;
            d.EmailVerificationTokenExpiry = null;
            d.PasswordHash = string.Empty;
            d.PasswordSalt = string.Empty;
            d.CredentialVersion = NextCredentialVersion(d.CredentialVersion);
            // The user already holds this high-entropy email-link token. Reuse
            // it once for choosing a password instead of exposing a second
            // token in a response or relying on a second email delivery.
            d.PasswordResetToken = token;
            d.PasswordResetTokenExpiry = DateTimeOffset.UtcNow.AddHours(1);
            await _tableClient.UpdateEntityAsync(d, d.ETag, TableUpdateMode.Merge);
            return d;
        }
        return null;
    }

    // Kept for callers that only need a yes/no verification result.
    public async Task<bool> VerifyEmailTokenAsync(string token) =>
        await VerifyEmailAndStartPasswordSetupAsync(token) is not null;

    public async Task<DealershipEntity?> SetPasswordResetTokenAsync(string email)
    {
        var entity = await GetByLoginEmailAsync(email);
        if (entity is null || !entity.IsEmailVerified) return null;

        entity.PasswordResetToken = GenerateSecureToken();
        entity.PasswordResetTokenExpiry = DateTimeOffset.UtcNow.AddHours(1);
        await _tableClient.UpdateEntityAsync(entity, entity.ETag);
        return entity;
    }

    /// <summary>
    /// Resets a root account password and returns the affected account so the
    /// caller can revoke every existing browser session. The compatibility
    /// bool wrapper below is retained for existing callers.
    /// </summary>
    public async Task<DealershipEntity?> ResetPasswordAndGetAccountAsync(string token, string newPassword)
    {
        await foreach (var d in _tableClient.QueryAsync<DealershipEntity>(d =>
            d.PartitionKey == Pk && d.PasswordResetToken == token))
        {
            if (!IsRootAccount(d, d.RowKey) || d.PasswordResetTokenExpiry is null ||
                d.PasswordResetTokenExpiry < DateTimeOffset.UtcNow)
                return null;
            var (hash, salt) = HashPassword(newPassword);
            d.PasswordHash = hash;
            d.PasswordSalt = salt;
            d.CredentialVersion = NextCredentialVersion(d.CredentialVersion);
            d.PasswordResetToken = string.Empty;
            d.PasswordResetTokenExpiry = null;
            await _tableClient.UpdateEntityAsync(d, d.ETag, TableUpdateMode.Merge);
            return d;
        }
        return null;
    }

    public async Task<bool> ResetPasswordAsync(string token, string newPassword) =>
        await ResetPasswordAndGetAccountAsync(token, newPassword) is not null;

    private static string GenerateSecureToken()
    {
        var bytes = new byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public static bool VerifyPassword(string password, string hash, string salt)
    {
        if (string.IsNullOrWhiteSpace(hash) || string.IsNullOrWhiteSpace(salt)) return false;
        try
        {
            var saltBytes = Convert.FromBase64String(salt);
            using var pbkdf2 = new Rfc2898DeriveBytes(password, saltBytes, 100_000, HashAlgorithmName.SHA256);
            var computed = Convert.ToBase64String(pbkdf2.GetBytes(32));
            return CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.UTF8.GetBytes(computed),
                System.Text.Encoding.UTF8.GetBytes(hash));
        }
        catch (FormatException)
        {
            return false;
        }
    }

    /// <summary>Asigna credenciales de prueba a una automotora existente y marca el email como verificado.</summary>
    public async Task SetTestCredentialsAsync(string id, string email, string password)
    {
        var entity = await GetByIdAsync(id);
        if (entity is null) return;
        var (hash, salt) = HashPassword(password);
        // Keep an existing public contact address intact. Test credentials are
        // credentials, not a profile/contact update.
        if (string.IsNullOrWhiteSpace(entity.Email)) entity.Email = email;
        entity.LoginEmail = email;
        entity.PasswordHash = hash;
        entity.PasswordSalt = salt;
        entity.CredentialVersion = NextCredentialVersion(entity.CredentialVersion);
        entity.IsEmailVerified = true;
        entity.EmailVerificationToken = string.Empty;
        entity.EmailVerificationTokenExpiry = null;
        await _tableClient.UpdateEntityAsync(entity, entity.ETag);
    }

    private static (string hash, string salt) HashPassword(string password)
    {
        var saltBytes = new byte[16];
        RandomNumberGenerator.Fill(saltBytes);
        var salt = Convert.ToBase64String(saltBytes);
        using var pbkdf2 = new Rfc2898DeriveBytes(password, saltBytes, 100_000, HashAlgorithmName.SHA256);
        var hash = Convert.ToBase64String(pbkdf2.GetBytes(32));
        return (hash, salt);
    }

    private static long NextCredentialVersion(long current)
    {
        if (current >= long.MaxValue)
            throw new InvalidOperationException("No se puede actualizar la versión de credenciales.");
        return Math.Max(0, current) + 1;
    }

    private static bool IsRootAccount(DealershipEntity dealership, string accountId) =>
        !dealership.IsLoginEmailIndex &&
        string.Equals(dealership.RowKey, accountId, StringComparison.Ordinal) &&
        string.Equals(GetAccountId(dealership), accountId, StringComparison.Ordinal);

    private static string CreateLoginEmailIndexRowKey(string email)
    {
        var canonicalEmail = email.Trim().ToUpperInvariant();
        var hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(canonicalEmail));
        return "email-index:" + Convert.ToHexString(hash);
    }
}
