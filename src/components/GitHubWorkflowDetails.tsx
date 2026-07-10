import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, GitCommit, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { fetchGitHubWorkflowRunJobs, fetchGitHubJobLogs } from "@/lib/github";
import { cn } from "@/lib/utils";
import { statusIcon } from "./OverviewHelpers";

function WorkflowStep({ step, stepIndex, allSteps, owner, repo, jobId, jobStatus }: any) {
  const [expanded, setExpanded] = useState(false);

  const { data: jobLogs, isLoading: isLoadingLogs, isError, error } = useQuery({
    queryKey: ["github-job-logs", owner, repo, jobId],
    queryFn: () => fetchGitHubJobLogs(owner, repo, jobId),
    enabled: expanded,
    staleTime: 60000,
  });

  const getStepLogs = (logText: string, currentStepIndex: number, allSteps: any[]) => {
    if (!logText || !allSteps || allSteps.length === 0) return "";
    
    const lines = logText.split('\n');
    const filtered: string[] = [];
    
    let activeStepIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let lineTime = 0;
      
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
      if (match) {
        lineTime = new Date(match[1]).getTime();
      }
      
      while (activeStepIndex < allSteps.length - 1) {
        const nextStep = allSteps[activeStepIndex + 1];
        let advance = false;
        
        if (nextStep.status === 'completed' && nextStep.conclusion === 'skipped') {
          advance = true;
        } else {
          const groupMatch = line.match(/##\[group\]Run\s+(.+)/);
          if (groupMatch && groupMatch[1].trim() === (nextStep.name || "").trim()) {
            advance = true;
          } else if (lineTime > 0 && nextStep.started_at) {
            const currentStep = allSteps[activeStepIndex];
            const nextStartTime = new Date(nextStep.started_at).getTime();
            const currentStartTime = currentStep.started_at ? new Date(currentStep.started_at).getTime() : 0;
            
            if (nextStartTime > currentStartTime) {
              if (lineTime >= nextStartTime) {
                 advance = true;
              }
            } else {
              const currentEndTime = currentStep.completed_at ? new Date(currentStep.completed_at).getTime() : 0;
              if (currentEndTime > 0 && lineTime >= currentEndTime) {
                 advance = true;
              }
            }
          }
        }
        
        if (advance) {
          activeStepIndex++;
        } else {
          break;
        }
      }

      if (activeStepIndex === currentStepIndex) {
        filtered.push(line.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*/, ''));
      }
    }
    
    return filtered.join('\n');
  };

  const formatDuration = (start: string, end: string) => {
    if (!start || !end) return "";
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const diff = Math.max(0, e - s) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s`;
    const mins = Math.floor(diff / 60);
    const secs = Math.floor(diff % 60);
    return `${mins}m ${secs}s`;
  };

  const stepLogs = expanded && jobLogs ? getStepLogs(jobLogs, stepIndex, allSteps) : "";

  return (
    <div className="flex flex-col border-b border-[#30363d] last:border-0 group">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 py-3 hover:bg-[#1f242c] transition-colors w-full text-left"
      >
        <div className="flex-shrink-0 mt-0.5 text-zinc-500">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-shrink-0 mt-0.5">
          {statusIcon(step.conclusion, step.status)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200">{step.name}</p>
        </div>
        <div className="flex-shrink-0 text-[11px] text-zinc-500 font-mono">
          {formatDuration(step.started_at, step.completed_at)}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-[#0d1117]">
          <div className="rounded-md border border-[#30363d] bg-black p-4 overflow-x-auto max-h-[400px]">
            {isLoadingLogs ? (
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading execution logs...
              </div>
            ) : isError ? (
              <div className="text-yellow-400 text-xs font-mono italic whitespace-pre-wrap">
                {String((error as any)?.message).includes("BlobNotFound") || String((error as any)?.message).includes("404") ? 
                  "Logs are not yet available. GitHub only provides raw logs via the API after the entire job completes. Please wait for the job to finish." : 
                  `Error fetching logs: ${(error as any)?.message}\n(This is often a CORS issue because GitHub redirects to S3 buckets that don't support browser fetching)`}
              </div>
            ) : stepLogs ? (
              <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap font-mono">
                {stepLogs}
              </pre>
            ) : (
              <div className="text-zinc-500 text-xs font-mono italic">
                No log output found for this step.
                <br/>
                Debug: jobLogs length = {jobLogs?.length || 0}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function GitHubWorkflowDetails({ run, owner, repo, onClose }: any) {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["github-run-jobs", owner, repo, run?.id],
    queryFn: () => fetchGitHubWorkflowRunJobs(owner, repo, run?.id),
    enabled: !!run && !!owner && !!repo,
    refetchInterval: run?.status === "in_progress" ? 5000 : false,
  });

  const jobs = jobsData?.jobs || [];
  
  useEffect(() => {
    if (jobs.length > 0 && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  if (!run) return null;

  const selectedJob = jobs.find((j: any) => j.id === selectedJobId) || jobs[0];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative z-10 w-full max-w-6xl h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0">
              {statusIcon(run.conclusion, run.status)}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate flex items-center gap-2">
                {run.name}
                <span className="text-xs font-normal text-muted-foreground">#{run.run_number}</span>
              </h2>
              <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1"><GitCommit className="h-3 w-3" /> {run.head_sha?.substring(0, 7)}</span>
                <span>Branch: {run.head_branch}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-zinc-800 bg-zinc-900/50 overflow-y-auto flex-shrink-0 flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Jobs
            </div>
            {isLoading ? (
              <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
            ) : jobs.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">No jobs found.</div>
            ) : (
              <div className="flex-1 py-2">
                {jobs.map((job: any) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      selectedJobId === job.id ? "bg-blue-500/10 text-blue-400" : "text-zinc-300 hover:bg-zinc-800"
                    )}
                  >
                    <div className="flex-shrink-0">
                      {statusIcon(job.conclusion, job.status)}
                    </div>
                    <div className="flex-1 min-w-0 truncate text-sm font-medium">
                      {job.name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 bg-[#0d1117] overflow-y-auto flex flex-col">
            {selectedJob ? (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                  {selectedJob.name}
                  {selectedJob.status === "in_progress" && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30 animate-pulse">Running</span>}
                </h3>
                
                <div className="space-y-1 bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
                  {selectedJob.steps?.map((step: any, index: number) => (
                    <WorkflowStep 
                      key={index} 
                      step={step} 
                      stepIndex={index}
                      allSteps={selectedJob.steps}
                      owner={owner} 
                      repo={repo} 
                      jobId={selectedJob.id} 
                      jobStatus={selectedJob.status}
                    />
                  ))}
                  {(!selectedJob.steps || selectedJob.steps.length === 0) && (
                    <div className="px-4 py-8 text-center text-sm text-zinc-500">
                      No steps details available for this job yet.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
                {isLoading ? "Loading job details..." : "Select a job to view details"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
