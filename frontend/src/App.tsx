import React from 'react';
import DashboardLayout from './layouts/DashboardLayout';

function App() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-4">Trading Research Platform</h1>
        <p className="text-gray-400">Welcome to the Trading Research Platform interface.</p>
      </div>
    </DashboardLayout>
  );
}

export default App;
