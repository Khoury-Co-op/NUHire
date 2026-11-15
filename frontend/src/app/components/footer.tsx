'use client';

import { FaDiscord } from 'react-icons/fa';
import Link from 'next/link';

const Footer: React.FC = () => {
  return (
    <footer className="sticky bottom-0 z-50 text-center p-2 bg-northeasternBlack text-northeasternRed">
      <div className="flex items-center justify-center font-rubik font-extrabold text-sm">
        <Link
          href="https://discord.com/invite/jyvzqyJHy6"
          className="flex items-center space-x-1 text-northeasternRed"
        >
          <FaDiscord size={18} />
          <span>Join our Discord</span>
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
