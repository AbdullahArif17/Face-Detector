/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "192.168.0.116",
    "http://192.168.0.116:3000",
    "https://192.168.0.116:3000",
  ],
};

export default nextConfig;
