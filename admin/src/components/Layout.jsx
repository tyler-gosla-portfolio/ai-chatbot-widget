import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/kb', label: 'Knowledge Base' },
  { to: '/admin/keys', label: 'API Keys' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function Layout() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('admin_token');
    navigate('/admin/');
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <nav className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">Chatbot Admin</h1>
        </div>
        <ul className="flex-1 py-4 space-y-1 px-3">
          {navItems.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
