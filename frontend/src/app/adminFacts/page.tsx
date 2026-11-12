'use client';
import React, { useEffect, useState } from 'react';
import NavbarAdmin from '../components/navbar-admin'; // Importing the admin navbar component
import { useSocket } from '../components/socketContext'; // Importing custom hook to use socket context
import { API_BASE_URL } from '../../lib/api';

interface ModeratorClass {
  crn: number;
  class_name: string;
}

export default function AdminFactsPage() {
  const [classes, setClasses] = useState<ModeratorClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [facts, setFacts] = useState(['', '', '']);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const [currentFacts, setCurrentFacts] = useState<{
    one: string;
    two: string;
    three: string;
  } | null>(null);
  const socket = useSocket();

  // Fetch classes for dropdown
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const userRes = await fetch(`${API_BASE_URL}/auth/user`, { credentials: 'include' });
        const userData = await userRes.json();
        if (userRes.ok && userData.email && userData.affiliation === 'admin') {
          const res = await fetch(`${API_BASE_URL}/moderator/classes-full/${userData.email}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            setClasses(data);
          }
        }
      } catch (error) {
        setPopup({ headline: 'Error', message: 'Failed to fetch classes.' });
      } finally {
        setLoading(false);
      }
    };
    fetchClasses();
  }, []);

  // Fetch current saved facts for the selected class
  useEffect(() => {
    if (!selectedClass) {
      setCurrentFacts(null);
      return;
    }

    const fetchFacts = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/facts/get/${selectedClass}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          // API returns [] when no facts; controller returns object { one, two, three } when exists
          if (Array.isArray(data) && data.length === 0) {
            setCurrentFacts(null);
          } else if (
            data &&
            (data.one !== undefined || data.two !== undefined || data.three !== undefined)
          ) {
            setCurrentFacts({
              one: data.one || '',
              two: data.two || '',
              three: data.three || '',
            });
          } else {
            setCurrentFacts(null);
          }
        } else {
          // non-ok - still clear but show a popup
          setCurrentFacts(null);
          const errorText = await res.text();
          setPopup({
            headline: 'Error',
            message: `Failed to fetch facts: ${errorText || res.statusText}`,
          });
        }
      } catch (error) {
        setCurrentFacts(null);
        setPopup({ headline: 'Error', message: 'Failed to fetch facts.' });
      }
    };

    fetchFacts();
  }, [selectedClass]);

  // Setup socket to auto-refresh facts when they change (server emits 'factsUpdated' to class room)
  useEffect(() => {
    if (!socket) return;

    const handleFactsUpdated = () => {
      // re-fetch facts for current selectedClass
      if (!selectedClass) return;
      (async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/facts/get/${selectedClass}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length === 0) {
              setCurrentFacts(null);
            } else if (
              data &&
              (data.one !== undefined || data.two !== undefined || data.three !== undefined)
            ) {
              setCurrentFacts({
                one: data.one || '',
                two: data.two || '',
                three: data.three || '',
              });
            } else {
              setCurrentFacts(null);
            }
          }
        } catch (err) {
          // swallow socket-triggered fetch errors silently (we already have UI for manual actions)
          console.error('Error fetching facts after factsUpdated socket:', err);
        }
      })();
    };

    socket.on('factsUpdated', handleFactsUpdated);

    return () => {
      socket.off('factsUpdated', handleFactsUpdated);
      socket.disconnect();
    };
  }, []); // only once

  const handleFactChange = (index: number, value: string) => {
    setFacts((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || facts.some((f) => !f.trim())) {
      setPopup({
        headline: 'Error',
        message: 'Please select class, group, and enter all three facts.',
      });
      return;
    }
    try {
      // Send as { one, two, three }
      const payload = { one: facts[0], two: facts[1], three: facts[2] };
      const res = await fetch(`${API_BASE_URL}/facts/create/${selectedClass}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setPopup({ headline: 'Success', message: 'Facts added successfully!' });
        setFacts(['', '', '']);
        // update local currentFacts immediately to reflect saved changes (server will also emit)
        setCurrentFacts({ one: payload.one, two: payload.two, three: payload.three });
      } else {
        const errorData = await res.json().catch(() => ({}));
        setPopup({ headline: 'Error', message: errorData.error || 'Failed to add facts.' });
      }
    } catch (error) {
      setPopup({ headline: 'Error', message: 'Failed to add facts.' });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-sand font-rubik">
      <NavbarAdmin />
      {/* Page Title */}
      <div className="flex justify-center items-center py-6">
        <h1 className="text-4xl font-bold text-northeasternBlack text-center drop-shadow-lg">
          Waiting Page Facts
        </h1>
      </div>
      <div className="flex-1 p-6 flex justify-center items-start">
        <div className="max-w-lg w-full bg-white border-4 border-northeasternBlack justify-center rounded-lg shadow-lg p-8 mt-10">
          <h1 className="text-3xl font-bold text-northeasternRed mb-6 text-center">
            Add Waiting Room Facts
          </h1>

          {/* Display current facts (if any) */}
          {selectedClass ? (
            <div className="mb-6 p-4 rounded bg-gray-50 border border-gray-200">
              <h3 className="font-semibold text-northeasternBlack mb-2">
                Current Facts for CRN {selectedClass}
              </h3>
              {currentFacts ? (
                <ul className="list-disc pl-5 text-gray-800">
                  <li className="mb-1">
                    {currentFacts.one || <em className="text-gray-400">—</em>}
                  </li>
                  <li className="mb-1">
                    {currentFacts.two || <em className="text-gray-400">—</em>}
                  </li>
                  <li className="mb-1">
                    {currentFacts.three || <em className="text-gray-400">—</em>}
                  </li>
                </ul>
              ) : (
                <p className="text-gray-600 italic">No facts set yet for this class.</p>
              )}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Class Dropdown */}
            <div>
              <label className="block text-lg font-medium mb-2 text-northeasternBlack">
                Select Class:
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full p-3 border border-wood rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select a Class --</option>
                {classes.map((cls) => (
                  <option key={cls.crn} value={cls.crn}>
                    {cls.class_name} (CRN: {cls.crn})
                  </option>
                ))}
              </select>
            </div>

            {/* Fact Inputs */}
            {selectedClass && (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i}>
                    <label className="block text-md font-medium mb-1 text-northeasternBlack">
                      Fact {i + 1}:
                    </label>
                    <input
                      type="text"
                      value={facts[i]}
                      onChange={(e) => handleFactChange(i, e.target.value)}
                      className="w-full p-3 border border-wood rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={`Enter fact ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <button
              type="submit"
              className="w-full mt-6 px-6 py-3 font-semibold rounded-md bg-northeasternRed text-white hover:bg-navy transition"
              disabled={loading}
            >
              Add Facts
            </button>
          </form>

          {popup && (
            <div
              className={`mt-6 p-4 rounded text-center font-medium ${popup.headline === 'Success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
            >
              <h2 className="text-lg font-bold mb-2">{popup.headline}</h2>
              <p>{popup.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
