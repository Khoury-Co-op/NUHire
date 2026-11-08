'use client';
import { API_BASE_URL } from '../../lib/api';
import Navbar from '../components/navbar';
import NavbarAdmin from '../components/navbar-admin';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';

export default function UserProfile() {
  const router = useRouter();
  const { user: authUser, loading: userloading } = useAuth();

  const handleLogout = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Ensures cookies clear if using sessions
      });

      if (response.ok) {
        router.push('/'); // Redirect to home page
      } else {
        console.error('Failed to logout:', response.statusText);
      }
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (userloading) {
    return <PageLoader />;
  }

  return (
    <div>
      {authUser?.affiliation !== 'admin' ? <Navbar /> : <NavbarAdmin />}
      <div className="bg-sand flex flex-col items-center justify-center p-6 min-h-screen">
        <div className="bg-northeasternWhite p-8 rounded-2xl shadow-lg w-full max-w-lg border-2 border-black">
          <h1 className="text-4xl font-bold mb-4 text-northeasternRed text-center">User Profile</h1>

          {authUser && (
            <div className="space-y-6">
              <div className="bg-northeasternWHite p-4 rounded-lg border border-black">
                <h2 className="text-xl font-semibold text-northeasternRed mb-2">
                  Personal Information
                </h2>
                <p className="text-black">
                  <span className="font-semibold">Name:</span> {authUser.f_name} {authUser.l_name}
                </p>
                <p className="text-black">
                  <span className="font-semibold">Email:</span> {authUser.email}
                </p>
                <p className="text-black">
                  <span className="font-semibold">Role:</span> {authUser.affiliation}
                </p>
                {authUser.group_id && (
                  <p className="text-black">
                    <span className="font-semibold">Group:</span> {authUser.group_id}
                  </p>
                )}
                {authUser.class && (
                  <p className="text-black">
                    <span className="font-semibold">Class:</span> {authUser.class}
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="mt-6 px-6 py-3 bg-red-600 hover:bg-red-700 transition-all duration-300 rounded-lg shadow-md text-white font-semibold text-lg w-full border border-black"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
