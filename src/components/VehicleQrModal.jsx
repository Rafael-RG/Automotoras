import React, { useMemo } from 'react';
import QrCardModal from './QrCardModal';
import { vehicleQrCard } from './qrCardData';

const VehicleQrModal = ({ vehicle, dealership, onClose }) => {
  const { brand, model, year, id } = vehicle || {};
  const dealershipName = dealership?.name;
  const card = useMemo(
    () => vehicleQrCard({ brand, model, year, id }, dealershipName),
    [brand, model, year, id, dealershipName],
  );
  return <QrCardModal card={card} onClose={onClose} />;
};

export default VehicleQrModal;
