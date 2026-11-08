'use client';
export const dynamic = 'force-dynamic';
import { API_BASE_URL } from '../../lib/api';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Slideshow from '../components/slideshow';
import { useSocket } from '../components/socketContext';
import Facts from '../components/facts';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';

export default function WaitingGroupPage() {
  const socket = useSocket();
  const router = useRouter();
  const { user, loading: userloading } = useAuth();
  const startedRef = useRef(false);

  const groupStatusResponse = async () => {
    if (startedRef.current || !user?.class || !user?.group_id) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/groups/status/${user.class}/${user.group_id}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('Group status request failed:', response.status, response.statusText);
        return;
      }

      const statusData = await response.json();

      if (statusData.started && !startedRef.current) {
        startedRef.current = true;
        const seenResponse = await fetch(
          `${API_BASE_URL}/groups/seen?email=${encodeURIComponent(user.email)}`,
          { method: 'GET', credentials: 'include' }
        );

        if (seenResponse.ok) {
          const seenData = await seenResponse.json();

          if (seenData.seen === 1) {
            router.push('/dashboard');
          } else {
            router.push('/about');
          }
        } else {
          router.push('/about');
        }
      }
    } catch (error) {
      console.error('Error fetching group status:', error);
      startedRef.current = false;
    }
  };

  useEffect(() => {
    if (!user?.class || !user?.group_id) {
      return;
    }

    groupStatusResponse();
    const timer = setInterval(groupStatusResponse, 10000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!socket || !user?.class) {
      return;
    }

    // Handle connection
    const handleConnect = () => {
      socket.emit('joinClass', {
        classId: user.class,
      });

      const roomId = `group_${user.group_id}_class_${user.class}`;
      socket.emit('joinGroup', roomId);
      groupStatusResponse();
    };

    const handleConnectError = (error: Error) => {
      console.error('Socket connection error:', error);
    };

    const handleGroupStartedGroup = ({ group_id }: { group_id: number }) => {
      if (group_id === user.group_id) {
        groupStatusResponse();
      }
    };

    const handleGroupStartedClass = () => {
      groupStatusResponse();
    };

    // Check if already connected
    if (socket.connected) {
      handleConnect();
    }

    // Attach listeners
    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('groupStartedGroup', handleGroupStartedGroup);
    socket.on('groupStartedClass', handleGroupStartedClass);

    // Cleanup listeners only, don't disconnect
    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('groupStartedGroup', handleGroupStartedGroup);
      socket.off('groupStartedClass', handleGroupStartedClass);
    };
  }, [socket, user, router]);

  if (userloading) {
    return <PageLoader />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please log in to continue</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-sand font-rubik">
      {/* Background Slideshow */}
      <div className="fixed inset-0 z-0">
        <Slideshow />
      </div>

      {/* Overlay */}
      <div className="fixed inset-0 bg-sand/80 z-[5]" />

      {/* Main Content */}
      <div className="z-10 flex flex-col items-center justify-center relative flex-grow p-8">
        <div className="max-w-2xl w-full text-center">
          <div className="mb-8">
            <h1 className="text-4xl font-extrabold text-northeasternRed mb-4">
              Waiting for Teacher
            </h1>
            <p className="text-xl text-northeasternBlack mb-4">
              Hello, {user.f_name} {user.l_name}!
            </p>
            {user.class && <p className="text-lg text-navy mb-6">Class CRN: {user.class}</p>}
          </div>

          <div className="bg-white rounded-lg shadow-lg border-4 border-northeasternBlack p-8 mb-8">
            <div className="flex flex-col items-center space-y-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-northeasternRed border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 bg-northeasternRed rounded-full opacity-20 animate-pulse"></div>
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-navy mb-4">
                  Waiting for Teacher to allow Start
                </h2>
                <Facts />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full flex justify-center p-2 bg-navy/90 backdrop-blur-sm shadow-md font-rubik text-2xl z-20">
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
