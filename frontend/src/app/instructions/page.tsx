'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Slideshow from '../components/slideshow';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';
import { API_BASE_URL } from '../../lib/api';

export default function InstructionsPage() {
  const { user, loading: userLoading } = useAuth();
  const router = useRouter();

  const updateUserSeeDash = async () => {
    if (!user?.email) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/users/update-seen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: user.email,
        }),
      });

      if (response.ok) {
        return true;
      } else {
        console.error('Failed to update user-see-dash field:', response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Error updating user-see-dash field:', error);
      return false;
    }
  };

  const handleContinue = async () => {
    if (!user) return;

    await updateUserSeeDash();
    const fullName = `${user.f_name} ${user.l_name}`.trim();
    router.push(`/dashboard?name=${encodeURIComponent(fullName)}`);
  };

  if (userLoading) {
    return <PageLoader />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-sand font-rubik">
      <div className="fixed inset-0 z-0">
        <Slideshow />
      </div>

      <div className="fixed inset-0 bg-sand/80 z-[5]" />

      <div className="z-10 flex flex-col items-center relative flex-grow p-8 overflow-y-auto">
        <h1 className="text-4xl font-extrabold text-northeasternRed mb-8 text-center">
          NUHire Progress Steps
        </h1>
        <h2 className="text-3xl font-extrabold text-northeasternBlack mb-8 text-center">
          In the shoes of an employer, you will go through the following steps:
        </h2>
        <div className="max-w-2xl w-full space-y-8 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-8 border-northeasternRed">
            <h2 className="text-2xl font-bold mb-2">
              <span className="text-northeasternRed">1.</span>{' '}
              <span className="text-navy">Job Description</span>
            </h2>
            <p className="text-gray-800">
              Your group will be assigned a real job description. Read it carefully to understand
              the role and what the employer is looking for in a candidate.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-8 border-northeasternRed">
            <h2 className="text-2xl font-bold mb-2">
              <span className="text-northeasternRed">2.</span>{' '}
              <span className="text-navy">Resume Review</span>
            </h2>
            <p className="text-gray-800">
              Individually, you'll review a set of candidate resumes. Mark which ones you think are
              strong fits for the job. Your group will later discuss and compare your choices.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-8 border-northeasternRed">
            <h2 className="text-2xl font-bold mb-2">
              <span className="text-northeasternRed">3.</span>{' '}
              <span className="text-navy">Group Resume Review</span>
            </h2>
            <p className="text-gray-800">
              As a team, you'll discuss your individual resume picks and decide together which
              candidates should move forward to the interview stage.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-8 border-northeasternRed">
            <h2 className="text-2xl font-bold mb-2">
              <span className="text-northeasternRed">4.</span>{' '}
              <span className="text-navy">Interview Stage</span>
            </h2>
            <p className="text-gray-800">
              Watch short video interviews of the selected candidates. Rate their responses and
              discuss as a group who impressed you most.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-8 border-northeasternRed">
            <h2 className="text-2xl font-bold mb-2">
              <span className="text-northeasternRed">5.</span>{' '}
              <span className="text-navy">Make Offer</span>
            </h2>
            <p className="text-gray-800">
              Your group will choose the candidate that gets a job offer for the role and submit
              your hiring decision.
            </p>
          </div>
        </div>
        <button
          onClick={handleContinue}
          className="mt-10 mb-16 px-6 py-4 bg-navy text-sand border-4 border-navy rounded-md text-xl font-bold transition-opacity hover:opacity-60 active:opacity-30"
          disabled={userLoading || !user}
        >
          Continue to Dashboard
        </button>
      </div>

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
