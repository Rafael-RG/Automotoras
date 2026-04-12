import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import InventoryScreen from './pages/InventoryScreen';
import DealershipFinderScreen from './pages/DealershipFinderScreen';
import DealershipProfileScreen from './pages/DealershipProfileScreen';
import ProductDetailScreen from './pages/ProductDetailScreen';
import RegisterScreen from './pages/RegisterScreen';
import AdminDashboard from './pages/AdminDashboard';
import PrivacyScreen from './pages/PrivacyScreen';
import LoginScreen from './pages/LoginScreen';
import PagoExitosoScreen from './pages/PagoExitosoScreen';
import SobreNosotrosScreen from './pages/SobreNosotrosScreen';
import PaginaAterrizajeScreen from './pages/PaginaAterrizajeScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<InventoryScreen />} />
        <Route path="/dealerships" element={<DealershipFinderScreen />} />
        <Route path="/dealerships/:id" element={<DealershipProfileScreen />} />
        <Route path="/product/:brand/:id" element={<ProductDetailScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/pago-exitoso" element={<PagoExitosoScreen />} />
        <Route path="/sobre-nosotros" element={<SobreNosotrosScreen />} />
        <Route path="/unirse" element={<PaginaAterrizajeScreen />} />
        <Route path="/privacidad" element={<PrivacyScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        {/* Fallback routes for other nav items */}
        <Route path="/performance" element={<InventoryScreen />} />
        <Route path="/heritage" element={<InventoryScreen />} />
        <Route path="/bespoke" element={<InventoryScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
