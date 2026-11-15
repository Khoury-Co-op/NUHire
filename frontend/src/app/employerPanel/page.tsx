'use client';

import Navbar from '../components/navbar';
import { useProgress } from '../components/useProgress';

export default function EmployerPannel() {
  useProgress();

  const completeAssignment = () => {
    localStorage.setItem('progress', 'employer');
    window.location.href = '/dashboard';
  };
  return (
    <div>
      <Navbar />
      <h1>Here is a video about what an employer would do...</h1>
      <button onClick={completeAssignment}>Back to Dashboard</button>
    </div>
  );
}
