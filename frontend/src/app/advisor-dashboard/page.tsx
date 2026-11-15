'use client'; //Declares that this page is a client component
export const dynamic = 'force-dynamic';
import React, { useEffect } from 'react'; // Importing React and the effect hook
import { useRouter } from 'next/navigation'; // Importing useRouter for navigation
import Link from 'next/link'; // Importing Link for client-side navigation
import NavbarAdmin from '../components/navbar-admin'; // Importing the admin navbar component
import Slideshow from '../components/slideshow'; // Importing slideshow component for background
import { useSocket } from '../components/socketContext'; // Importing custom hook to use socket context
import { useAuth } from '../components/AuthContext'; // Importing custom hook to use authentication context
import { PageLoader } from '../components/spinner';

const Dashboard = () => {
  const router = useRouter();
  const socket = useSocket();
  const { user, loading: userloading } = useAuth();

  // Socket connection - only run when both socket AND user are ready
  useEffect(() => {
    if (!socket || !user?.email) return;

    socket.emit('adminOnline', { adminEmail: user.email });

    return () => {
      socket.emit('adminOffline', { adminEmail: user.email });
    };
  }, [socket, user?.email]);

  if (userloading) {
    return <PageLoader />;
  }

  if (!user || user.affiliation !== 'admin') {
    // If the user is not an admin, redirect to the home page
    router.push('/');
    return null; // Return null to avoid  anything else
  }

  //  the dashboard if the user is an admin
  return (
    <div className="flex flex-col min-h-screen bg-northeasternWhite font-rubik">
      <div className="fixed inset-0 z-0">
        <Slideshow />
      </div>
      <div className="fixed inset-0 bg-sand/80 z-[5]" />
      <NavbarAdmin />
      <div className="mt-6" />
      <div className="flex justify-center items-center py-1 z-10">
        <h1 className="text-4xl font-bold text-northeasternBlack text-center drop-shadow-lg">
          Advisor Dashboard
        </h1>
      </div>

      <main className="flex flex-col items-center justify-center flex-grow z-10">
        <div className="mt-6 gap-6 flex flex-row justify-center items-center">
          <Link
            href="/live-class"
            className="px-8 py-8 bg-northeasternWhite text-northeasternRed border-4 border-northeasternRed font-semibold rounded-2xl shadow-xl hover:bg-northeasternRed hover:text-northeasternWhite transition flex flex-col items-center justify-center text-center text-lg w-72 h-72"
          >
            <span className="text-4xl mb-2">📡</span>
            <span>Live Class</span>
          </Link>
          <Link
            href="/grouping"
            className="px-8 py-8 bg-northeasternWhite text-northeasternRed border-4 border-northeasternRed font-semibold rounded-2xl shadow-xl hover:bg-northeasternRed hover:text-northeasternWhite transition flex flex-col items-center justify-center text-center text-lg w-72 h-72"
          >
            <span className="text-4xl mb-2">👥</span>
            <span>Manage Groups</span>
          </Link>
          <Link
            href="/new-pdf"
            className="px-8 py-8 bg-northeasternWhite text-northeasternRed border-4 border-northeasternRed font-semibold rounded-2xl shadow-xl hover:bg-northeasternRed hover:text-northeasternWhite transition flex flex-col items-center justify-center text-center text-lg w-72 h-72"
          >
            <span className="text-4xl mb-2">📤</span>
            <span>Upload Job and Resumes</span>
          </Link>
          <Link
            href="/adminFacts"
            className="px-8 py-8 bg-northeasternWhite text-northeasternRed border-4 border-northeasternRed font-semibold rounded-2xl shadow-xl hover:bg-northeasternRed hover:text-northeasternWhite transition flex flex-col items-center justify-center text-center text-lg w-72 h-72"
          >
            <span className="text-4xl mb-2">🔍</span>
            <span>Waiting Facts</span>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
