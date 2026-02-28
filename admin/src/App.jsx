import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import KnowledgeBase from './pages/KnowledgeBase.jsx';
import ApiKeys from './pages/ApiKeys.jsx';
import Settings from './pages/Settings.jsx';
import Layout from './components/Layout.jsx';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('admin_token');
  return token ? children : <Navigate to="/admin/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/" element={<Login />} />
        <Route
          path="/admin/*"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="kb" element={<KnowledgeBase />} />
          <Route path="keys" element={<ApiKeys />} />
          <Route path="settings" element={<Settings />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
