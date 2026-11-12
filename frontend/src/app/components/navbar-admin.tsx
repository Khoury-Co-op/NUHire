'use client'; // Declares that this page is a client component
import React from 'react'; // Importing React
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const NavbarAdmin = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const adminLinks = [
    { label: 'Dashboard', path: '/advisor-dashboard' },
    { label: 'Profile', path: '/userProfile' },
    { label: 'Live Class', path: '/live-class' },
    { label: 'Manage Groups', path: '/grouping' },
    { label: 'Upload Jobs and Resumes', path: '/new-pdf' },
    { label: 'Waiting Facts', path: '/adminFacts' },
  ];

  return (
    <nav className="navbar w-full relative">
      {/* Top bar */}
      <div className="bg-northeasternBlack text-northeasternWhite flex items-center justify-between px-6 py-4 font-rubik border-b-4 border-northeasternRed w-full">
        <button
          className="flex items-center gap-2 font-bold text-xl focus:outline-none"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>Menu</span>
          <span
            className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          >
            ▶
          </span>
        </button>
        <Link
          href="/advisor-dashboard"
          className="text-3xl font-rubik font-bold text-northeasternRed drop-shadow-lg"
        >
          NUHire
        </Link>
        <Link
          href="/userProfile"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-northeasternRed cursor-pointer transition duration-300 ease-in-out hover:bg-northeasternBlack hover:border-2 hover:border-northeasternRed relative"
        >
          <div
            className="w-6 h-6 bg-cover bg-center rounded-full border-2 border-northeasternWhite"
            style={{
              backgroundImage: "url('https://cdn-icons-png.flaticon.com/512/847/847969.png')",
            }}
          >
            {' '}
          </div>
        </Link>
      </div>
      <div
        ref={dropdownRef}
        className={`fixed top-0 left-0 z-50 bg-northeasternWhite shadow-lg transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-auto min-w-max border-r-4 border-northeasternRed`}
        style={{
          borderTopRightRadius: isOpen ? '1rem' : '0',
          borderBottomRightRadius: isOpen ? '1rem' : '0',
          height: '400px',
          top: '0',
        }}
      >
        <div className="flex flex-col gap-2 pt-6 px-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-xl text-northeasternRed">Menu</span>
            <button
              className="text-xl text-gray-500 hover:text-northeasternRed"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          {adminLinks.map((link) => (
            <button
              key={link.path}
              className="block px-4 py-2 font-rubik text-northeasternRed hover:bg-northeasternRed hover:text-northeasternWhite rounded-md text-left"
              onClick={() => {
                setIsOpen(false);
                router.push(link.path);
              }}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default NavbarAdmin;
