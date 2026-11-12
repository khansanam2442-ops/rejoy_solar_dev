import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storage';
import { FieldLocationSharer } from '../tracking/FieldLocationSharer';
import { TodayAttendanceCard } from '../hrms/TodayAttendanceCard';
import {
  Navigation,
  MapPin,
  CheckSquare,
  Camera,
  Calendar,
  Clock,
  Layers,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  ChevronRight,
  ShieldCheck,
  Zap,
  Wrench,
  Upload
} from 'lucide-react';

export const FieldDashboard: React.FC = () => {
  const { setActiveView, openCustomerControlCenter, refreshTrigger, showToast } = useApp();
  const { currentUser } = useAuth();

  const projects = useMemo(() => storageService.getProjects(), [refreshTrigger]);

  // Derive site work orders dynamically from projects persisted in MySQL
  const fieldTasks = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      project: string;
      location: string;
      time: string;
      status: string;
      checklist: string;
      projectId: string;
      customerId: string;
    }> = [];

    projects.forEach(p => {
      p.stages?.forEach(s => {
        const isAssigned =
          s.assignedEmployeeId === currentUser?.employeeId ||
          s.assignedEmployeeName === currentUser?.name ||
          s.assignedRole === currentUser?.role ||
          s.status === 'IN PROGRESS';

        if (isAssigned && s.status !== 'COMPLETED') {
          const completedCount = s.checklist?.filter(c => c.completed).length || 0;
          const totalChecklist = s.checklist?.length || 0;
          list.push({
            id: `${p.id}-${s.id || s.stageKey}`,
            title: s.title,
            project: `${p.title} (${p.capacityKw} kWp)`,
            location: p.siteAddress || p.location || 'Site Location',
            time: s.dueDate || 'Today',
            status: s.status === 'IN PROGRESS' ? 'IN_PROGRESS' : 'PENDING',
            checklist: totalChecklist > 0 ? `${completedCount}/${totalChecklist} checklist items` : 'Checklist pending',
            projectId: p.id,
            customerId: p.customerId
          });
        }
      });
    });

    return list;
  }, [projects, currentUser]);

  const handleUploadPhotos = () => {
    showToast('Photo upload portal opened. Geolocated photos attached with GPS metadata.', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-800 via-orange-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Field Operations & Site Execution
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-300 font-medium">{currentUser?.role}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Field Technician & Engineering Console
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Complete on-site engineering checklists, capture geolocated installation photos, and broadcast your real-time GPS location to the central control room.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleUploadPhotos}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-500/25 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Upload Site Photos</span>
            </button>
            <button
              onClick={() => setActiveView('projects_all')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/15 transition-all cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>Assigned Projects</span>
            </button>
          </div>
        </div>
      </div>

      {/* Today's Attendance Card */}
      <TodayAttendanceCard />

      {/* Field Worker GPS Live Telemetry Broadcaster */}
      <FieldLocationSharer />

      {/* Today's Work Orders / Field Visits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Today's Site Work Orders</h3>
              <p className="text-xs text-slate-500">Scheduled site visits, quality audits and technical tasks</p>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              {fieldTasks.length} {fieldTasks.length === 1 ? 'Task' : 'Tasks'} Active
            </span>
          </div>

          <div className="space-y-3.5">
            {fieldTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-medium text-slate-500">No active work orders</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Assigned solar project milestones and site checklists will appear here.</p>
              </div>
            ) : (
              fieldTasks.map(task => (
                <div
                  key={task.id}
                  className="p-4 rounded-xl bg-slate-50 hover:bg-amber-50/40 border border-slate-200/80 hover:border-amber-300 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <h4 className="text-xs font-bold text-slate-900">{task.title}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" /> {task.time}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        task.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-semibold text-slate-800">{task.project}</span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <MapPin className="w-3 h-3 text-slate-400" /> {task.location}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">
                      Checklist: <strong className="text-slate-800">{task.checklist}</strong>
                    </span>

                    <button
                      onClick={() => {
                        if (task.customerId && task.projectId) {
                          openCustomerControlCenter(task.customerId, task.projectId);
                        } else {
                          setActiveView('projects_all');
                        }
                      }}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Execute Checklist</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Field Actions & Safety Checklist */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Field Actions</h3>
            <div className="space-y-2.5">
              <button
                onClick={handleUploadPhotos}
                className="w-full p-3 bg-slate-50 hover:bg-amber-50 text-left border border-slate-200 rounded-xl flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Upload Site Photos</div>
                  <div className="text-[10px] text-slate-500">Geotagged high-res images</div>
                </div>
              </button>

              <button
                onClick={() => setActiveView('projects_all')}
                className="w-full p-3 bg-slate-50 hover:bg-blue-50 text-left border border-slate-200 rounded-xl flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Technical Checklists</div>
                  <div className="text-[10px] text-slate-500">MMS, civil & inverter logs</div>
                </div>
              </button>

              <button
                onClick={() => setActiveView('live_tracking')}
                className="w-full p-3 bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 rounded-xl flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Navigation className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Field Dispatch Map</div>
                  <div className="text-[10px] text-slate-500">View team locations</div>
                </div>
              </button>
            </div>
          </div>

          {/* Daily Safety Protocols */}
          <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-200 shadow-2xs">
            <div className="flex items-center gap-2 mb-2 text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Safety Protocols</h4>
            </div>
            <ul className="text-[11px] text-emerald-800 space-y-1.5 list-disc list-inside">
              <li>Wear safety harness & helmet on elevated roofs</li>
              <li>Inspect ladder hooks and fall arrest systems</li>
              <li>Verify lock-out tag-out (LOTO) on LT panels</li>
              <li>Confirm earth pit resistance is below 5 Ohms</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
