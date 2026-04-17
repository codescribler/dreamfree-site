import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Direct content replacements (porting WP article → new equivalent)
      {
        source: "/marketing/digital-content-marketing-attract-right-audience",
        destination: "/learning-centre/content-marketing-ideas",
        permanent: true,
      },

      // Legacy WP articles without direct equivalents → learning centre hub
      { source: "/copywriting/great-subheads", destination: "/learning-centre", permanent: true },
      { source: "/marketing/referral-marketing", destination: "/learning-centre", permanent: true },
      { source: "/analytics/complete-guide-multivariate-testing", destination: "/learning-centre", permanent: true },
      { source: "/social-media/get-unstuck-social-media-content-plan", destination: "/learning-centre", permanent: true },

      // WP category / blog index → learning centre hub
      { source: "/category/:slug*", destination: "/learning-centre", permanent: true },
      { source: "/blog", destination: "/learning-centre", permanent: true },
      { source: "/blog/:slug*", destination: "/learning-centre", permanent: true },

      // Training/course content retired → services (signal: we do it for you now)
      { source: "/course/:slug*", destination: "/services", permanent: true },
      { source: "/module/:slug*", destination: "/services", permanent: true },
      { source: "/marketing-on-demand", destination: "/services", permanent: true },
      { source: "/membership-accelerator", destination: "/services", permanent: true },
      { source: "/high-converting-homepage/:slug*", destination: "/services", permanent: true },
      { source: "/growth-audit", destination: "/services", permanent: true },

      // WP navigation pages → new equivalents
      { source: "/contact-us", destination: "/contact", permanent: true },
      { source: "/portfolio", destination: "/services", permanent: true },
      { source: "/portfolio/:slug*", destination: "/services", permanent: true },

      // WP legal + misc
      { source: "/disclaimer", destination: "/privacy", permanent: true },
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/home-2", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
