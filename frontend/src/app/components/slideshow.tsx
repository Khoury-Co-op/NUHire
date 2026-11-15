'use client';
import React, { useEffect } from 'react';
import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';

const SLIDESHOW_IMAGES = [
  '/Khoury/1.jpg',
  '/Khoury/2.jpg',
  '/Khoury/3.jpg',
  '/Khoury/4.jpg',
  '/Khoury/5.jpg',
  '/Khoury/6.jpg',
];

const settings = {
  dots: true,
  infinite: true,
  speed: 2000,
  fade: true,
  slidesToShow: 1,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 6000,
  arrows: false,
  cssEase: 'ease-in-out',
};

export default function Slideshow() {
  useEffect(() => {
    SLIDESHOW_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      <style jsx global>{`
        .slick-slider,
        .slick-list,
        .slick-track {
          height: 100% !important;
        }
        .slick-slide,
        .slick-slide > div {
          height: 100% !important;
        }
      `}</style>

      <Slider {...settings} className="h-full">
        {SLIDESHOW_IMAGES.map((image, idx) => (
          <div key={idx} className="h-full">
            <div
              className="w-full h-full bg-center bg-cover"
              style={{ backgroundImage: `url(${image})` }}
            />
          </div>
        ))}
      </Slider>
    </div>
  );
}
