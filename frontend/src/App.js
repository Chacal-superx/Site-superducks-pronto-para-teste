import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import RobotList from './components/RobotList';
import RobotDetails from './components/RobotDetails';
import AddRobot from './components/AddRobot';
import BulkOperations from './components/BulkOperations';
import DiagnosticCenter from './components/DiagnosticCenter';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/robots" element={<RobotList />} />
            <Route path="/robots/:id" element={<RobotDetails />} />
            <Route path="/add-robot" element={<AddRobot />} />
            <Route path="/bulk-operations" element={<BulkOperations />} />
            <Route path="/diagnostics" element={<DiagnosticCenter />} />
          </Routes>
        </main>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
          }}
        />
      </div>
    </Router>
  );
}

export default App;