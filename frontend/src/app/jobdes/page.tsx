'use client';
export const dynamic = 'force-dynamic';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { pdfSource } from '../../lib/pdfSource';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import Navbar from '../components/navbar';
import Popup from '../components/popup';
import Footer from '../components/footer';
import { usePathname } from 'next/navigation';
import { useSocket } from '../components/socketContext';
import { useAuth } from '../components/AuthContext';
import Instructions from '../components/instructions';
import { useProgressManager } from '../components/progress';
import { useJobDescription } from '../components/useJobDescription';
import { PageLoader } from '../components/spinner';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface CommentType {
  id: string;
  x: number;
  y: number;
  text: string;
  page: number;
  isEditing?: boolean;
}

export default function JobDescriptionPage() {
  const socket = useSocket();
  const { user, loading: userloading } = useAuth();
  const { updateProgress } = useProgressManager();
  const { job, error: jobError } = useJobDescription(user);
  const fileUrl = job?.filePath ? `${API_BASE_URL}/${job.filePath}` : '';
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [showInstructions, setShowInstructions] = useState(true);
  const [tool] = useState<'pointer' | 'comment'>('pointer');

  const [popup, setPopup] = useState<{ headline: string; message: string } | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const pathname = usePathname();
  const hasUpdatedPageRef = useRef(false);
  const [showScrollUp, setShowScrollUp] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const jobDesInstructions = [
    'Read the job description that you are hiring for.',
    'Take notes by pressing the top right notes button, you can always access them.',
    'Pay attention to the required skills and qualifications.',
    'Look for specific technologies or tools mentioned.',
    'Note any soft skills that are emphasized in the job description.',
  ];

  useEffect(() => {
    const handleShowInstructions = () => {
      setShowInstructions(true);
    };

    window.addEventListener('showInstructions', handleShowInstructions);

    return () => {
      window.removeEventListener('showInstructions', handleShowInstructions);
    };
  }, []);

  useEffect(() => {
    if (user) updateProgress(user, 'job_description');
  }, [user]);

  // Handle scroll indicators
  useEffect(() => {
    const handleScroll = () => {
      const container = pdfContainerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;

      // Show scroll up indicator if not at top
      setShowScrollUp(scrollTop > 20);

      // Show scroll down indicator if not at bottom
      setShowScrollDown(scrollTop < scrollHeight - clientHeight - 20);
    };

    const container = pdfContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [pdfLoaded]);

  useEffect(() => {
    if (!socket || !user?.email) return;

    socket.emit('studentOnline', { studentId: user.email });
    socket.emit('studentPageChanged', { studentId: user.email, currentPage: pathname });

    // Only update the database once per page visit
    if (!hasUpdatedPageRef.current) {
      const updateCurrentPage = async () => {
        try {
          await fetch(`${API_BASE_URL}/users/update-currentpage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: 'jobdes', user_email: user.email }),
            credentials: 'include',
          });
          hasUpdatedPageRef.current = true; // Mark as updated
        } catch (error) {
          console.error('Error updating current page:', error);
        }
      };

      updateCurrentPage();
    }
  }, [socket, user?.email, pathname]);

  useEffect(() => {
    if (!socket) return;

    const handleReceivePopup = ({ headline, message }: { headline: string; message: string }) => {
      setPopup({ headline, message });
    };

    socket.on('receivePopup', handleReceivePopup);

    return () => {
      socket.off('receivePopup', handleReceivePopup);
    };
  }, [socket]);

  // This page tells the student when there is no job to show, except when the
  // assignment request itself fails, which it has always ignored.
  useEffect(() => {
    if (jobError && jobError !== 'assignment') {
      setPopup({
        headline: 'No Job Assignment',
        message: "You haven't been assigned a job description yet. Please contact your instructor.",
      });
    }
  }, [jobError]);

  useEffect(() => {
    const savedComments = localStorage.getItem('pdf-comments');
    if (savedComments) {
      setComments(JSON.parse(savedComments));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pdf-comments', JSON.stringify(comments));
  }, [comments]);

  const handlePdfClick = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (tool !== 'comment') return;
    const pdfPage = document.querySelector('.react-pdf__Page') as HTMLElement | null;
    if (!pdfPage) {
      return;
    }
    const pageRect = pdfPage.getBoundingClientRect();
    if (
      event.clientX >= pageRect.left &&
      event.clientX <= pageRect.right &&
      event.clientY >= pageRect.top &&
      event.clientY <= pageRect.bottom
    ) {
      // Calculate coordinates relative to PDF
      const x = ((event.clientX - pageRect.left) / pageRect.width) * 100;
      const y = ((event.clientY - pageRect.top) / pageRect.height) * 100;
      const newComment: CommentType = {
        id: String(Date.now()),
        x,
        y,
        text: '',
        page: pageNumber,
        isEditing: true,
      };
      setComments([...comments, newComment]);
    }
  };

  // Update comment text and turn off editing mode
  const updateComment = (id: string, newText: string) => {
    setComments((prevComments) =>
      prevComments.map((comment) =>
        comment.id === id ? { ...comment, text: newText, isEditing: false } : comment
      )
    );
  };

  const deleteComment = (id: string) => {
    setComments((prevComments) => prevComments.filter((comment) => comment.id !== id));
  };

  const toggleEditComment = (id: string) => {
    setComments((prevComments) =>
      prevComments.map((comment) => (comment.id === id ? { ...comment, isEditing: true } : comment))
    );
  };

  if (userloading) {
    return <PageLoader />;
  }

  if (!user) return <div>Error: User not found.</div>;

  return (
    <div className="h-screen flex flex-col bg-sand font-rubik overflow-hidden">
      {showInstructions && (
        <Instructions
          instructions={jobDesInstructions}
          onDismiss={() => setShowInstructions(false)}
          title="Job Description Instructions"
          progress={0}
        />
      )}
      <Navbar />

      {/* Main content area with fixed height */}
      <div className="flex-1 flex flex-col px-4 py-8 overflow-hidden">
        {/* Title */}
        <div className="flex justify-center items-center font-rubik text-redHeader text-4xl font-bold mb-4">
          Job Description
        </div>

        {/* Scrollable PDF Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 bg-gray-100 border-2 border-gray-300 rounded-lg shadow-lg p-6 mx-auto max-w-5xl relative overflow-hidden">
            {/* Scroll Up Indicator */}
            {showScrollUp && (
              <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none flex items-start justify-center">
                <div className="text-blue-600 text-xs font-semibold animate-bounce">
                  ▲ Scroll up
                </div>
              </div>
            )}

            <div
              ref={pdfContainerRef}
              id="pdf-container"
              className={`h-full overflow-y-auto ${tool === 'comment' ? 'cursor-crosshair' : ''}`}
              onClick={handlePdfClick}
            >
              <div className="bg-white border border-gray-400 rounded-lg shadow-md p-4 h-fit mx-auto w-fit">
                <Document
                  file={pdfSource(fileUrl)}
                  onLoadSuccess={({ numPages }) => {
                    setNumPages(numPages);
                    setPdfLoaded(true);
                  }}
                  className={`relative`}
                >
                  <Page
                    pageNumber={pageNumber}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="flex justify-center"
                    scale={1.3}
                  />

                  {comments
                    .filter((comment) => comment.page === pageNumber)
                    .map((comment) => (
                      <div
                        key={comment.id}
                        className="comment-overlay absolute bg-white shadow-md p-2 rounded-md"
                        style={{
                          left: `${comment.x}%`,
                          top: `${comment.y}%`,
                        }}
                      >
                        {comment.isEditing ? (
                          <input
                            type="text"
                            placeholder="Enter comment..."
                            autoFocus
                            className="border border-gray-400 rounded-md p-1 text-sm"
                            defaultValue={comment.text}
                            onBlur={(e) => updateComment(comment.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateComment(comment.id, (e.target as HTMLInputElement).value);
                              }
                            }}
                          />
                        ) : (
                          <div className="relative">
                            <div
                              className="bg-gray-200 text-sm p-2 rounded-md cursor-pointer"
                              onClick={() => toggleEditComment(comment.id)}
                            >
                              {comment.text}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteComment(comment.id);
                              }}
                              className="absolute top-0 right-0 text-red-500 text-xs"
                            >
                              X
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </Document>
              </div>
              {popup && (
                <Popup
                  headline={popup.headline}
                  message={popup.message}
                  onDismiss={() => setPopup(null)}
                />
              )}
            </div>

            {/* Scroll Down Indicator */}
            {showScrollDown && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none flex items-end justify-center">
                <div className="text-blue-600 text-xs font-semibold animate-bounce">
                  ▼ Scroll down
                </div>
              </div>
            )}
          </div>

          {/* Page Navigation - Fixed below PDF */}
          <div className="flex justify-center items-center gap-5 mt-5 mb-3 w-full flex-shrink-0">
            <button
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(pageNumber - 1)}
              className="px-4 py-2 rounded bg-navy font-rubik text-white transition duration-300 hover:bg-redHeader disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>

            <span className="font-bold text-lg mx-4">
              Page {pageNumber} of {numPages}
            </span>

            <button
              disabled={pageNumber >= (numPages || 1)}
              onClick={() => setPageNumber(pageNumber + 1)}
              className="px-4 py-2 rounded bg-navy font-rubik text-white transition duration-300 hover:bg-redHeader disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <footer className="flex-shrink-0">
        <div className="flex justify-end mt-4 mb-4 mr-4">
          <button
            onClick={async () => {
              // ✅ Make async
              await updateProgress(user, 'res_1'); // ✅ Await
              localStorage.setItem('progress', 'res_1');
              window.location.href = '/res-review';
            }}
            className="px-4 py-2 bg-redHeader text-white rounded-lg shadow-md hover:bg-navy transition duration-300 font-rubik"
          >
            Next: Resume Review pt. 1 →
          </button>
        </div>
      </footer>
      <Footer />
    </div>
  );
}
