import React, { useMemo } from 'react';
import QrCardModal from './QrCardModal';
import { dealershipQrCard } from './qrCardData';

const DealershipQrModal = ({ dealership, onClose }) => {
  const { name, address, city, country, id } = dealership || {};
  const card = useMemo(
    () => dealershipQrCard({ name, address, city, country, id }),
    [name, address, city, country, id],
  );
  return <QrCardModal card={card} onClose={onClose} />;
};

export default DealershipQrModal;
