'use client';
import { useState, useEffect } from 'react';
import Slideshow from '../components/slideshow';
import Image from 'next/image';
import { API_BASE_URL } from '../../lib/api';

export default function SignupDetails() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [affiliation, setAffiliation] = useState('none');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchUserDetails = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const userEmail = urlParams.get('email');
      const userFirstName = urlParams.get('firstName');
      const userLastName = urlParams.get('lastName');

      if (userEmail) {
        setEmail(userEmail);

        // Set first and last name from URL parameters if available
        if (userFirstName) {
          setFirstName(userFirstName);
        }

        if (userLastName) {
          setLastName(userLastName);
        }
      } else {
        setMessage('Something went wrong. Please restart login process.');
      }
    };

    fetchUserDetails();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);

    // Basic validation
    if (!firstName || !lastName || !email || affiliation === 'none') {
      setMessage('Please complete the form before submitting.');
      setSubmitting(false);
      return;
    }

    if (affiliation === 'student') {
      try {
        const checkRes = await fetch(`${API_BASE_URL}/users/check/${email}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!checkRes.ok) {
          setMessage('Error checking your registration status.');
          setSubmitting(false);
          return;
        }

        const checkData = await checkRes.json();

        if (checkData.group_id === null || checkData.class_id === null) {
          setMessage(
            'Student is not registered by instructor. Please contact your instructor to be added to the system.'
          );
          setSubmitting(false);
          return; // CRITICAL: Stop execution here
        }
      } catch (error) {
        console.error('Error checking email:', error);
        setMessage('Error checking your email. Please try again.');
        setSubmitting(false);
        return;
      }

      try {
        const emailRes = await fetch(`${API_BASE_URL}/moderator/classes/${email}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!emailRes.ok) {
          setMessage('Please check your affiliation and try again.');
          setSubmitting(false);
          return;
        }

        const emailData = await emailRes.json();

        if (emailData.length !== 0) {
          setMessage('Please use a student email to sign up.');
          setSubmitting(false);
          return;
        }
      } catch (error) {
        console.error('Error validating affiliation:', error);
        setMessage('Error validating your affiliation.');
        setSubmitting(false);
        return;
      }
    }

    if (affiliation === 'admin') {
      try {
        const res = await fetch(`${API_BASE_URL}/moderator/classes/${email}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!res.ok) {
          setMessage('Please check your affiliation and try again.');
          setSubmitting(false);
          return;
        }

        const crns = await res.json();

        if (crns.length === 0) {
          setMessage('Please use an instructor email to sign up.');
          setSubmitting(false);
          return;
        }
      } catch (error) {
        console.error('Error validating affiliation:', error);
        setMessage('Error validating your affiliation.');
        setSubmitting(false);
        return;
      }
    }

    // Create user object
    const user = {
      First_name: firstName,
      Last_name: lastName,
      Email: email,
      Affiliation: affiliation,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
        credentials: 'include',
      });

      if (response.ok) {
        setMessage('User added successfully!');
        setTimeout(() => {
          window.location.href = `${API_BASE_URL}/auth/post-signup-redirect`;
        }, 1500);
      } else {
        const errorData = await response.json();
        setMessage(errorData.message || 'There was an error submitting the form.');
        setSubmitting(false);
      }
    } catch (error) {
      console.error('Error during signup:', error);
      setMessage('An error occurred while submitting the form.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-sand font-rubik">
      <div className="fixed inset-0 z-0">
        <Slideshow />
      </div>
      <div className="fixed inset-0 bg-sand/80 z-[5]" />
      <div className="w-full flex justify-center p-4 bg-navy/90 backdrop-blur-sm shadow-md font-rubik text-lg fixed top-0 z-20">
        <h1 className="text-6xl font-extrabold mb-1 text-northeasternRed">NUHire</h1>
      </div>
      <div className="z-10">
        <h1 className="text-3xl font-bold text-navy mb-6">Complete Your Signup</h1>

        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-navy shadow-lg rounded-lg p-6 flex flex-col gap-4"
        >
          <input
            type="text"
            placeholder="First Name *"
            className="w-full px-4 py-3 border border-wood bg-springWater rounded-md bg-gray-200 cursor-not-allowed"
            value={firstName}
            disabled
          />

          <input
            type="text"
            placeholder="Last Name *"
            className="w-full px-4 py-3 border border-wood bg-springWater rounded-md bg-gray-200 cursor-not-allowed"
            value={lastName}
            disabled
          />

          <input
            type="email"
            className="w-full px-4 py-3 border border-wood bg-springWater rounded-md bg-gray-200 cursor-not-allowed"
            value={email}
            disabled
          />

          <select
            value={affiliation}
            className="w-full px-4 py-3 border border-wood bg-springWater rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setAffiliation(e.target.value)}
            required
          >
            <option value="none">Select Affiliation *</option>
            <option value="student">Student</option>
            <option value="admin">Faculty</option>
          </select>

          <button
            type="submit"
            className={`w-full bg-northeasternWhite text-northeasternRed font-semibold px-4 py-3 rounded-md hover:bg-northeasternRed hover:text-northeasternWhite transition ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={submitting}
          >
            {submitting ? 'Please wait...' : 'Submit'}
          </button>
        </form>
        {message && (
          <div className="flex justify-center">
            <div className="mt-4 text-northeasternBlack px-4 py-3 rounded text-center w-full max-w-md">
              {message}
            </div>
          </div>
        )}
      </div>
      <footer className="w-full flex justify-center p-2 bg-navy/90 backdrop-blur-sm shadow-md font-rubik text-2xl fixed bottom-0 z-20">
        <a
          className="flex items-center text-wood hover:text-blue-300 transition-colors duration-200"
          href="https://discord.com/invite/jyvzqyJHy6"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image src="/discord.svg" alt="Discord icon" width={25} height={25} />
          <span className="ml-2">Join our Discord</span>
        </a>
      </footer>
    </div>
  );
}
