'use client';
import { API_BASE_URL } from '../../lib/api';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Footer from '../components/footer';
import Slideshow from '../components/slideshow';
import Popup from '../components/popup';
import { useRouter } from 'next/navigation';
import { PageLoader } from '../components/spinner';

interface ModeratorInfo {
  id: number;
  crn: number;
  admin_email: string;
}

interface User {
  email: string;
  affiliation: string;
}

const ModDashboard = () => {
  const [info, setInfo] = useState<ModeratorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const [form, setForm] = useState({ admin_email: '', crn: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deletingCRN, setDeletingCRN] = useState<number | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [crnToDelete, setCrnToDelete] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkModeratorAuth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/verify-moderator`, {
          credentials: 'include',
        });

        if (!response.ok) {
          setPopup({
            headline: 'Unauthorized',
            message: 'Please log in to access this page.',
          });
          setTimeout(() => router.push('/mod-signin'), 2000);
          return;
        }

        const data = await response.json();

        if (!data.authenticated) {
          setPopup({
            headline: 'Unauthorized',
            message: 'Please log in to access this page.',
          });
          setTimeout(() => router.push('/mod-signin'), 2000);
          return;
        }

        setUser({ email: 'moderator', affiliation: 'admin' });
        setLoading(false);
      } catch (error) {
        console.error('Error checking authentication:', error);
        setPopup({
          headline: 'Error',
          message: 'Failed to verify authentication.',
        });
        setTimeout(() => router.push('/mod-signin'), 2000);
      }
    };

    checkModeratorAuth();
  }, [router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const fetchCRNs = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/moderator/crns`, {
          credentials: 'include',
        });

        if (response.status === 401 || response.status === 403) {
          setPopup({
            headline: 'Unauthorized',
            message: "You don't have permission to access this data.",
          });
          setTimeout(() => router.push('/mod-signin'), 2000);
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setInfo(data);
        } else {
          setPopup({ headline: 'Error', message: 'Failed to fetch CRNs.' });
        }
      } catch {
        setPopup({ headline: 'Error', message: 'Failed to fetch CRNs.' });
      }
    };

    fetchCRNs();
  }, [submitting, deletingCRN, user, router]);

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return null;
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/moderator/crns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          admin_email: form.admin_email,
          crn: Number(form.crn),
        }),
      });

      if (res.status === 401 || res.status === 403) {
        setPopup({
          headline: 'Unauthorized',
          message: "You don't have permission to perform this action.",
        });
        return;
      }

      if (res.status === 409) {
        setPopup({ headline: 'Duplicate', message: 'This CRN already exists.' });
      } else if (res.ok) {
        setForm({ admin_email: '', crn: '' });
        setPopup({ headline: 'Success', message: 'Class added!' });
      } else {
        setPopup({ headline: 'Error', message: 'Failed to add class.' });
      }
    } catch {
      setPopup({ headline: 'Error', message: 'Failed to add class.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (crn: number) => {
    setCrnToDelete(crn);
    setConfirmModalOpen(true);
  };

  const executeDelete = async () => {
    if (!crnToDelete) return;

    setConfirmModalOpen(false);
    setDeletingCRN(crnToDelete);

    try {
      const res = await fetch(`${API_BASE_URL}/moderator/crns/${crnToDelete}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.status === 401 || res.status === 403) {
        setPopup({
          headline: 'Unauthorized',
          message: "You don't have permission to perform this action.",
        });
        return;
      }

      if (res.ok) {
        setPopup({ headline: 'Success', message: 'CRN deleted!' });
      } else {
        setPopup({ headline: 'Error', message: 'Failed to delete CRN.' });
      }
    } catch {
      setPopup({ headline: 'Error', message: 'Failed to delete CRN.' });
    } finally {
      setDeletingCRN(null);
      setCrnToDelete(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen font-rubik relative overflow-hidden">
      <div className="fixed inset-0 z-0">
        <Slideshow />
      </div>
      <div className="fixed inset-0 bg-sand/80 z-[5]" />
      <nav className="navbar w-full relative">
        {/* Top bar */}
        <div className="bg-northeasternBlack text-northeasternWhite flex items-center justify-center px-6 py-4 font-rubik border-b-4 border-northeasternRed w-full">
          <Link
            href="/advisor-dashboard"
            className="text-3xl font-rubik text-center font-bold text-northeasternRed drop-shadow-lg"
          >
            NUHire
          </Link>
        </div>
      </nav>
      <div className="flex-1 flex flex-col px-4 py-8 z-10">
        <h1 className="text-3xl font-extrabold text-redHeader text-center mb-8">
          Admin Class Management
        </h1>

        {/* Center the two panels */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col md:flex-row gap-8 w-full max-w-6xl mx-auto">
            {/* Left: List of Classes */}
            <div className="flex-1 bg-white border-2 border-northeasternRed rounded-xl shadow-md p-6">
              <h4 className="text-xl font-bold text-northeasternRed mb-4 text-center">Classes</h4>
              {info.length === 0 ? (
                <div className="text-center text-gray-600">No CRNs found.</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {info.map((i) => (
                    <div
                      key={i.id}
                      className="w-full bg-northeasternWhite border border-northeasternRed rounded-lg shadow flex flex-col md:flex-row md:items-center justify-between p-4"
                    >
                      <div>
                        <div className="font-bold text-northeasternRed">CRN: {i.crn}</div>
                        <div className="text-navy text-sm">Teacher: {i.admin_email}</div>
                      </div>
                      <button
                        onClick={() => handleDelete(i.crn)}
                        className="mt-2 md:mt-0 px-4 py-2 bg-northeasternRed text-white rounded hover:bg-navy transition"
                        disabled={deletingCRN === i.crn}
                      >
                        {deletingCRN === i.crn ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Add a Class */}
            <div className="flex-1 bg-white border-2 border-northeasternRed rounded-xl shadow-md p-6">
              <h4 className="text-xl font-bold text-northeasternRed mb-4 text-center">
                Add a Class
              </h4>
              <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
                <input
                  type="email"
                  name="admin_email"
                  placeholder="Admin Email"
                  value={form.admin_email}
                  onChange={handleFormChange}
                  className="border p-2 rounded"
                  required
                />
                <input
                  type="number"
                  name="crn"
                  placeholder="CRN"
                  value={form.crn}
                  onChange={handleFormChange}
                  className="border p-2 rounded"
                  required
                />
                <button
                  type="submit"
                  className="bg-navy text-white py-2 rounded hover:bg-navy/80 transition"
                  disabled={submitting}
                >
                  {submitting ? 'Adding...' : 'Add Class'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete CRN {crnToDelete}? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={executeDelete}
                className="flex-1 bg-northeasternRed text-white py-2 px-4 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setConfirmModalOpen(false);
                  setCrnToDelete(null);
                }}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {popup && (
        <Popup headline={popup.headline} message={popup.message} onDismiss={() => setPopup(null)} />
      )}
      <Footer />
    </div>
  );
};

export default ModDashboard;
