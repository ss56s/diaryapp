
// Fix: Import React to resolve React namespace issues in TypeScript
import React from 'react';
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'DailyCraft',
  description: 'Personal Daily Logger',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Chart.js Library */}
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
