import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainDisplay from './components/MainDisplay.jsx';
import VirtualController from './components/VirtualController.jsx';
import GameSelect from './components/GameSelect.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GameSelect />} />
        <Route path="/:gameName" element={<MainDisplay />} />
        <Route path="/:gameName/:controllerId" element={<VirtualController />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
