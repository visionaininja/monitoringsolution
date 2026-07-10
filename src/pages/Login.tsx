import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, KeyRound, User, Lock, Eye, EyeOff, Timer } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Security state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutEndTime, setLockoutEndTime] = useState<number | null>(null);
  const [remainingLockout, setRemainingLockout] = useState(0);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutEndTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((lockoutEndTime - now) / 1000));
      
      setRemainingLockout(remaining);
      
      if (remaining === 0) {
        setLockoutEndTime(null);
        setFailedAttempts(0);
        setError(null);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutEndTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Block if locked out
    if (lockoutEndTime && Date.now() < lockoutEndTime) {
      return;
    }

    setError(null);

    // Hardcoded credentials as requested
    if (username === 'admin' && password === 'admin') {
      // Success! Reset security counters
      setFailedAttempts(0);
      setLockoutEndTime(null);
      
      // Mock a user profile for the AuthContext
      login({
        email: 'admin@yourspeak.com',
        name: 'Yourspeak Admin',
        picture: ''
      });
    } else {
      // Failed attempt
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      
      if (newAttempts >= 3) {
        // Lock out for 1 minute (60,000 ms)
        const lockUntil = Date.now() + 60000;
        setLockoutEndTime(lockUntil);
        setRemainingLockout(60);
        setError("Too many failed attempts. Security lockout initiated.");
      } else {
        const attemptsLeft = 3 - newAttempts;
        setError(`Invalid credentials. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`);
      }
    }
  };

  const isLockedOut = lockoutEndTime !== null && remainingLockout > 0;

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center relative overflow-hidden">
      {/* Dynamic Background Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] pointer-events-none" />
      
      <div className="z-10 w-full max-w-md p-8 relative">
        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 pointer-events-none" />
          
          <div className="flex flex-col items-center text-center space-y-6 relative z-10">
            {/* Futuristic AI Core Mascot */}
            <div className={cn(
              "h-32 w-32 rounded-full flex items-center justify-center relative transition-all duration-700 ease-in-out z-20",
              isLockedOut ? "scale-110" : "hover:scale-105"
            )}>
              {/* Outer Atmospheric Glow */}
              <div className={cn(
                "absolute inset-[-20%] rounded-full opacity-50 blur-2xl transition-all duration-1000",
                isLockedOut ? "bg-rose-600/40 animate-pulse" : "bg-cyan-500/30 group-hover:bg-cyan-400/50"
              )} />
              
              {/* Mechanical Ring */}
              <div className={cn(
                "absolute inset-0 rounded-full border-2 transition-all duration-700 border-dashed",
                isLockedOut ? "border-rose-500/50 animate-[spin_4s_linear_infinite]" : "border-cyan-500/30 animate-[spin_12s_linear_infinite]"
              )} />
              
              {/* Core Body (Glassmorphic) */}
              <div className="absolute inset-2 rounded-full bg-black/80 backdrop-blur-md border border-white/10 shadow-inner overflow-hidden flex items-center justify-center">
                
                {/* AI Eye / Iris tracking logic */}
                <div 
                  className="relative transition-all duration-150 ease-out flex items-center justify-center"
                  style={{ 
                    transform: isLockedOut 
                      ? 'scale(1.2)' 
                      : `translateX(${Math.min(25, password.length * 1.8)}px) scale(${showPassword ? 1.3 : 1})`,
                  }}
                >
                  {/* Glowing Core Background */}
                  <div className={cn(
                    "absolute h-16 w-16 rounded-full blur-md transition-colors duration-500",
                    isLockedOut ? "bg-rose-600/60" : "bg-cyan-500/50"
                  )} />

                  {/* The Pupil / Lens */}
                  <div className={cn(
                    "relative h-10 w-10 rounded-full border-4 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] flex items-center justify-center transition-colors duration-500",
                    isLockedOut ? "border-rose-400 bg-rose-950" : "border-cyan-300 bg-cyan-950"
                  )}>
                    {/* Inner light reflection */}
                    <div className="absolute top-1 right-2 h-2 w-2 rounded-full bg-white/60 blur-[1px]" />
                    
                    {/* Center sensor */}
                    <div className={cn(
                      "h-3 w-3 rounded-full transition-all duration-300",
                      isLockedOut ? "bg-rose-500 animate-ping" : "bg-cyan-200"
                    )} />
                    
                    {/* Crosshair / Target reticle (visible when not locked out) */}
                    {!isLockedOut && (
                      <svg className="absolute inset-0 w-full h-full text-cyan-500/40" viewBox="0 0 100 100">
                        <line x1="50" y1="10" x2="50" y2="25" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                        <line x1="50" y1="90" x2="50" y2="75" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                        <line x1="10" y1="50" x2="25" y2="50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                        <line x1="90" y1="50" x2="75" y2="50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                      </svg>
                    )}

                    {/* Locked out "X" or Glitch effect */}
                    {isLockedOut && (
                      <svg className="absolute inset-0 w-full h-full text-rose-500" viewBox="0 0 100 100">
                        <line x1="30" y1="30" x2="70" y2="70" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                        <line x1="70" y1="30" x2="30" y2="70" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Horizontal Scanner Beam */}
                {!isLockedOut && password.length > 0 && (
                  <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
                    <div className="h-full w-full bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent animate-[scan_2s_ease-in-out_infinite]" />
                  </div>
                )}
              </div>
            </div>

            {/* Title & Subtitle */}
            <div className="space-y-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Yourspeak Admin</h1>
              <p className="text-sm text-zinc-400">
                Please enter your credentials to securely access the monitoring dashboard.
              </p>
            </div>

            {/* Error & Lockout Banner */}
            {(error || isLockedOut) && (
              <div className={cn(
                "w-full flex flex-col gap-2 rounded-lg border px-4 py-3 animate-in fade-in slide-in-from-top-4 duration-300",
                isLockedOut ? "border-rose-500/50 bg-rose-500/10" : "border-orange-500/30 bg-orange-500/10"
              )}>
                <div className="flex items-start gap-3">
                  <ShieldAlert className={cn("h-5 w-5 flex-shrink-0 mt-0.5", isLockedOut ? "text-rose-400" : "text-orange-400")} />
                  <p className={cn("text-xs font-medium text-left leading-relaxed", isLockedOut ? "text-rose-300" : "text-orange-300")}>
                    {error}
                  </p>
                </div>
                {isLockedOut && (
                  <div className="flex items-center justify-center gap-2 mt-2 py-2 bg-black/40 rounded border border-rose-500/20">
                    <Timer className="h-4 w-4 text-rose-400 animate-pulse" />
                    <span className="text-sm font-mono font-bold text-rose-300">
                      00:{remainingLockout.toString().padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="w-full space-y-4 pt-2">
              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-zinc-500" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    disabled={isLockedOut}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                </div>
                
                <div className="relative group/password">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-zinc-500" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    disabled={isLockedOut}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-12 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                  <button
                    type="button"
                    disabled={isLockedOut}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-cyan-400 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLockedOut}
                className={cn(
                  "w-full flex items-center justify-center gap-2 font-bold rounded-xl py-3 px-6 transition-all",
                  isLockedOut 
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5" 
                    : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_20px_rgba(34,211,238,0.2)] hover:shadow-[0_0_25px_rgba(34,211,238,0.4)]"
                )}
              >
                {isLockedOut ? "Access Locked" : "Sign In"}
              </button>
            </form>
            
            <div className="w-full pt-4 border-t border-white/5">
              <p className="text-[10px] text-zinc-600 font-mono text-center uppercase tracking-widest">
                Protected by Yourspeak Security
              </p>
              <p className="text-xs text-zinc-500 font-mono text-center tracking-wide mt-2">
                Copyright &copy; 2026 Ryan Danielle Ubana
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
