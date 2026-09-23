import React from 'react';
import { Link } from 'react-router-dom';
import { FiFilm, FiClock, FiCreditCard, FiArrowRight, FiStar, FiZap, FiCheckCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import FrameScrub from '../components/FrameScrub';

const Home = () => {
  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    // `overflow-x-clip`, not `overflow-hidden`. The ambient blur circles below
    // bleed past the viewport and still need clipping, but `overflow: hidden`
    // makes this div a scroll container — which silently turns the cinematic
    // section's `position: sticky` into `static`, so the pinned viewport just
    // scrolled away instead of holding. `clip` contains the bleed without
    // creating a scroll container, so sticky keeps working.
    <div className="bg-slate-950 text-slate-100 overflow-x-clip flex flex-col relative selection:bg-rose-500 selection:text-white">

      {/* Ambient Background Lighting & Spotlights */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-rose-600/20 via-amber-500/10 to-transparent blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-[600px] -left-[200px] w-[500px] h-[500px] bg-indigo-600/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-[1000px] -right-[200px] w-[500px] h-[500px] bg-rose-600/15 blur-3xl pointer-events-none rounded-full" />

      {/* Scroll-scrubbed fly-through (300 pre-rendered frames) */}
      <FrameScrub />

      {/* Hero Section */}
      <section className="relative pt-12 pb-24 lg:pt-24 lg:pb-32 flex items-center justify-center min-h-[85vh]">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center px-4 max-w-5xl mx-auto"
        >
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full glass-panel border border-rose-500/30 text-rose-400 text-xs sm:text-sm font-bold uppercase tracking-widest mb-8 shadow-lg shadow-rose-500/10 animate-pulse">
            <FiZap className="w-4 h-4 text-amber-400" />
            <span>Next-Gen Cinema Booking Platform</span>
          </div>

          {/* Main Title */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white mb-8 leading-[1.08] font-display">
            EXPERIENCE THE <br />
            <span className="bg-gradient-to-r from-rose-500 via-amber-400 to-amber-200 bg-clip-text text-transparent drop-shadow-2xl">
              MAGIC OF CINEMA
            </span>
          </h1>

          <p className="text-lg sm:text-2xl text-slate-300 mb-10 max-w-3xl mx-auto font-normal leading-relaxed">
            Reserve your favorite seats in real-time, explore blockbusters in 4K IMAX, and enjoy seamless digital ticket passes.
          </p>

          {/* CTA Group */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
            <Link to="/movies">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto inline-flex items-center justify-center bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white font-extrabold px-9 py-4.5 rounded-2xl text-lg shadow-xl shadow-rose-600/30 hover:shadow-rose-600/50 transition-all duration-300 group border border-rose-400/20"
              >
                <FiFilm className="mr-3 w-6 h-6 transition-transform group-hover:rotate-12" />
                <span>Explore Movies</span>
                <FiArrowRight className="ml-3 w-6 h-6 transition-transform group-hover:translate-x-1.5" />
              </motion.button>
            </Link>

            <Link to="/register">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto inline-flex items-center justify-center glass-panel hover:bg-slate-800/80 text-slate-200 font-bold px-8 py-4 rounded-2xl text-lg border border-slate-700 transition-all"
              >
                <span>Create Account</span>
              </motion.button>
            </Link>
          </div>

          {/* Trust stats */}
          <div className="mt-16 pt-10 border-t border-slate-800/60 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { label: "Active Users", val: "500K+" },
              { label: "Partner Theatres", val: "120+" },
              { label: "Real-time Locking", val: "100%" },
              { label: "Rating & Reviews", val: "4.9 / 5" }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl sm:text-3xl font-black text-white font-display">{stat.val}</p>
                <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

        </motion.div>
      </section>

      {/* Feature Cards Grid */}
      <section className="py-20 relative z-10 bg-slate-950/60 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4 font-display">
              WHY MOVIE LOVERS CHOOSE US
            </h2>
            <p className="text-slate-400 text-lg">
              Engineered for the ultimate movie-going experience with zero wait times.
            </p>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              visible: { transition: { staggerChildren: 0.15 } }
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              {
                icon: FiClock,
                title: "Real-time Seat Locking",
                content: "Select your exact seat matrix on live interactive maps powered by instant WebSocket synchronization.",
                badge: "Live Socket",
                gradient: "from-rose-500 to-amber-500"
              },
              {
                icon: FiFilm,
                title: "Curated 4K Releases",
                content: "Browse premier releases, IMAX screenings, indie hits, and exclusive early access shows.",
                badge: "IMAX & 3D",
                gradient: "from-amber-400 to-emerald-400"
              },
              {
                icon: FiCreditCard,
                title: "Instant QR Passes",
                content: "Seamless digital wallet integration, gift cards, and instant paperless QR gate entry scanning.",
                badge: "Paperless",
                gradient: "from-purple-500 to-rose-500"
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                variants={fadeUp}
                className="glass-card glass-card-hover p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className="w-7 h-7" />
                    </div>
                    <span className="text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-3 font-display">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed mb-6">{feature.content}</p>
                </div>

                <div className="flex items-center space-x-2 text-xs font-bold text-rose-400 group-hover:text-rose-300 transition-colors">
                  <FiCheckCircle className="w-4 h-4" />
                  <span>Instant Availability</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Footer Highlight */}
      <section className="py-24 relative z-10 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <div className="glass-panel p-12 sm:p-16 rounded-3xl border border-rose-500/20 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />

            <FiStar className="w-12 h-12 text-amber-400 mx-auto mb-6 animate-bounce" />
            
            <h2 className="text-4xl sm:text-6xl font-black text-white mb-6 tracking-tight font-display">
              READY FOR YOUR NEXT SHOW?
            </h2>
            <p className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-8">
              Explore upcoming blockbusters and lock your seats in under 60 seconds.
            </p>

            <Link to="/movies">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white font-extrabold px-10 py-5 rounded-2xl text-xl shadow-xl shadow-rose-600/30 hover:shadow-rose-600/50 transition-all inline-flex items-center space-x-3"
              >
                <span>Book Tickets Now</span>
                <FiArrowRight className="w-6 h-6" />
              </motion.button>
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
};

export default Home;
