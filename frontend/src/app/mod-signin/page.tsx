'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Slideshow from '../components/slideshow';
import Link from 'next/link';
import Popup from '../components/popup';
import { API_BASE_URL } from '../../lib/api';

export default function ModeratorSignIn() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE_URL}/auth/moderator-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Add this to receive cookies
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push('/mod-dashboard');
    } else {
      setPopup({ headline: 'Login Failed', message: 'Invalid username or password.' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-sand font-rubik">
      <div className="fixed inset-0 z-0">
        <Slideshow />
      </div>
      <div className="fixed inset-0 bg-sand/80 z-[5]" />
      <nav className="navbar w-full relative">
        {/* Top bar */}
        <div className="bg-northeasternBlack text-northeasternWhite justify-center flex px-6 py-4 font-rubik border-b-4 border-northeasternRed w-full">
          <Link
            href="/advisor-dashboard"
            className="text-3xl font-rubik text-center font-bold text-northeasternRed drop-shadow-lg"
          >
            NUHire
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex flex-col justify-center items-center z-10 relative">
        <form
          onSubmit={handleSubmit}
          className="bg-white p-8 rounded-lg shadow-md flex flex-col gap-4 w-full max-w-sm z-10"
        >
          <h2 className="text-2xl font-bold text-center text-northeasternRed">Admin Sign In</h2>
          <input
            type="text"
            placeholder="Admin Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 rounded"
            required
          />
          <button
            type="submit"
            className="bg-navy text-white py-2 rounded hover:bg-navy/80 transition"
          >
            Sign In
          </button>
        </form>
      </div>
      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
    </div>
  );
}
