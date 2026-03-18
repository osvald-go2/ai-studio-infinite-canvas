import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FolderOpen, Bot, GitBranch, ChevronRight, Sparkles } from 'lucide-react';
import { DbProject } from '../types';

interface HomePageProps {
  projects: DbProject[];
  onOpenDirectory: () => void;
  onSwitchProject: (projectId: number) => void;
  onNewSession: () => void;
}

/* ── Particle Background ── */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  color: string;
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const PARTICLE_COUNT = 120;
    const colors = [
      'rgba(251,146,60,',  // orange-400
      'rgba(245,158,11,',  // amber-500
      'rgba(244,63,94,',   // rose-500
      'rgba(217,119,6,',   // amber-600
      'rgba(251,191,36,',  // amber-400
    ];

    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const force = (150 - dist) / 150;
          p.vx += (dx / dist) * force * 0.3;
          p.vy += (dy / dist) * force * 0.3;
        }

        p.vx *= 0.98;
        p.vy *= 0.98;
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.opacity + ')';
        ctx.fill();

        // Draw connections (warm amber tone)
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const cdx = p.x - p2.x;
          const cdy = p.y - p2.y;
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cdist < 100) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(217,119,6,${0.06 * (1 - cdist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
      onMouseMove={handleMouseMove}
    />
  );
}

/* ── Homepage Card ── */
export function HomePage({ projects, onOpenDirectory, onSwitchProject, onNewSession }: HomePageProps) {
  const [showAll, setShowAll] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<number | null>(null);

  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.last_opened_at).getTime() - new Date(a.last_opened_at).getTime()
  );
  const displayProjects = showAll ? sortedProjects : sortedProjects.slice(0, 5);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Gradient background — warm dark tones matching app palette */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1A1A2E] via-[#1E1814] to-[#1A1A2E]" />

      {/* Ambient glow spots — warm orange/amber/rose */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-orange-500/[0.05] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] rounded-full bg-amber-600/[0.04] blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] rounded-full bg-rose-500/[0.03] blur-[80px] pointer-events-none" />

      {/* Particle layer */}
      <ParticleCanvas />

      {/* Center card */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div
          className="
            w-[440px] max-h-[85vh] flex flex-col
            bg-[#1E1814]/95 backdrop-blur-2xl
            border border-white/10 rounded-2xl
            shadow-2xl
            overflow-hidden
            animate-[cardAppear_0.6s_ease-out]
          "
        >
          {/* Logo & Title */}
          <div className="flex flex-col items-center pt-10 pb-6 px-8">
            <div className="
              w-16 h-16 rounded-2xl
              bg-gradient-to-br from-orange-400 to-rose-400
              flex items-center justify-center
              shadow-lg shadow-orange-500/20
              mb-4
              hover:shadow-orange-500/40 hover:scale-105
              transition-all duration-300
            ">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-white tracking-tight">AI Studio</h1>
            <p className="text-sm text-white/40 mt-1">Infinite Canvas</p>
          </div>

          {/* Action buttons */}
          <div className="px-8 space-y-3">
            <button
              onClick={onOpenDirectory}
              className="
                w-full py-3 rounded-xl
                bg-gradient-to-r from-orange-500 to-rose-500
                hover:from-orange-400 hover:to-rose-400
                text-white font-medium text-sm
                flex items-center justify-center gap-2
                shadow-lg shadow-orange-500/20
                hover:shadow-orange-500/30 hover:scale-[1.02]
                active:scale-[0.98]
                transition-all duration-200
              "
            >
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </button>
            <div className="flex gap-3">
              <button
                onClick={onNewSession}
                className="
                  flex-1 py-2.5 rounded-xl
                  bg-white/[0.05] border border-white/10
                  hover:bg-white/[0.1] hover:border-white/15
                  text-white/80 text-sm font-medium
                  flex items-center justify-center gap-2
                  hover:scale-[1.02] active:scale-[0.98]
                  transition-all duration-200
                "
              >
                <Bot className="w-4 h-4" />
                Agent Manager
              </button>
              <button
                className="
                  flex-1 py-2.5 rounded-xl
                  bg-white/[0.05] border border-white/10
                  hover:bg-white/[0.1] hover:border-white/15
                  text-white/80 text-sm font-medium
                  flex items-center justify-center gap-2
                  hover:scale-[1.02] active:scale-[0.98]
                  transition-all duration-200
                "
              >
                <GitBranch className="w-4 h-4" />
                Clone Repo
              </button>
            </div>
          </div>

          {/* Workspaces list */}
          <div className="mt-6 flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="px-8 mb-3">
              <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">Workspaces</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-on-hover px-4">
              {displayProjects.length === 0 ? (
                <div className="px-4 py-8 text-center text-white/20 text-sm">
                  No recent workspaces
                </div>
              ) : (
                displayProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onSwitchProject(project.id)}
                    onMouseEnter={() => setHoveredProject(project.id)}
                    onMouseLeave={() => setHoveredProject(null)}
                    className="
                      w-full px-4 py-3 rounded-xl
                      flex items-center justify-between
                      hover:bg-white/[0.06]
                      transition-all duration-200
                      group text-left
                    "
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white/90 truncate group-hover:text-white transition-colors">
                        {project.name}
                      </div>
                      <div className="text-xs text-white/30 truncate mt-0.5 group-hover:text-white/40 transition-colors">
                        {project.path.replace(/^\/Users\/[^/]+/, '~')}
                      </div>
                    </div>
                    <ChevronRight
                      className={`
                        w-4 h-4 text-white/20
                        transition-all duration-200
                        ${hoveredProject === project.id ? 'opacity-100 translate-x-0 text-orange-400/60' : 'opacity-0 -translate-x-2'}
                      `}
                    />
                  </button>
                ))
              )}
            </div>

            {/* Show More */}
            {sortedProjects.length > 5 && (
              <div className="px-8 py-3 border-t border-white/[0.05]">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs text-white/30 hover:text-orange-300/60 transition-colors w-full text-center"
                >
                  {showAll ? 'Show Less' : `Show More... (${sortedProjects.length - 5} more)`}
                </button>
              </div>
            )}

            {/* Bottom padding */}
            <div className="h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
