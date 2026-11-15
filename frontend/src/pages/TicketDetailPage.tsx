import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileUp,
  History,
  Lock,
  MessageSquare,
  Monitor,
  Paperclip,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Stethoscope,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/ui/Badges';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { TechnicianWorkload, TicketDetail, TicketStatus } from '../types';
import { formatBytes, formatDateTime, formatDurationMinutes } from '../utils/formatters';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Notas técnicas (Diagnóstico y Solución)
  const [diagnosis, setDiagnosis] = useState('');
  const [solution, setSolution] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Comentarios
  const [commentText, setCommentText] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  // Modal de Cambio de Estado
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<TicketStatus>('EN_PROCESO');
  const [statusComment, setStatusComment] = useState('');
  const [modalDiagnosis, setModalDiagnosis] = useState('');
  const [modalSolution, setModalSolution] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Modal de Asignación / Reasignación (ADMIN)
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [technicians, setTechnicians] = useState<TechnicianWorkload[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [assignReason, setAssignReason] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Subida adicional de evidencias
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const loadTicket = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: TicketDetail }>(`/api/tickets/${id}`);
      setTicket(res.data);
      setDiagnosis(res.data.diagnosis || '');
      setSolution(res.data.solution || '');
    } catch (err: any) {
      showToast(err.message || 'No se pudo cargar el detalle de la incidencia.', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  const canManageTechnical =
    user?.role === 'ADMIN' ||
    (user?.role === 'TECNICO' && ticket?.assignedTechnician?.id === user.technicianId);

  const openStatusModal = (next: TicketStatus) => {
    if (!ticket) return;
    setTargetStatus(next);
    setModalDiagnosis(diagnosis || ticket.diagnosis || '');
    setModalSolution(solution || ticket.solution || '');
    setStatusComment(
      next === 'EN_PROCESO'
        ? ticket.status === 'RESUELTO'
          ? 'Se reabre el ticket para verificación técnica adicional.'
          : 'Se inicia revisión y diagnóstico técnico de la incidencia.'
        : next === 'RESUELTO'
        ? 'Se comprobó la operatividad del servicio tras aplicar la solución.'
        : ''
    );
    setStatusModalOpen(true);
  };

  const handleConfirmStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;

    if (targetStatus === 'RESUELTO') {
      if (modalDiagnosis.trim().length < 5) {
        showToast('Registre el diagnóstico técnico antes de marcar como Resuelto.', 'warning');
        return;
      }
      if (modalSolution.trim().length < 5) {
        showToast('Registre la solución aplicada antes de marcar como Resuelto.', 'warning');
        return;
      }
    }

    setUpdatingStatus(true);
    try {
      await api.patch(`/api/tickets/${ticket.id}/status`, {
        status: targetStatus,
        comment: statusComment.trim(),
        diagnosis: modalDiagnosis.trim() || undefined,
        solution: modalSolution.trim() || undefined,
      });
      setStatusModalOpen(false);
      await loadTicket();
      await refreshUser();
      showToast(`Estado actualizado a ${targetStatus} correctamente.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo cambiar el estado.', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveTechnicalNotes = async () => {
    if (!ticket) return;
    setSavingNotes(true);
    try {
      await api.patch(`/api/tickets/${ticket.id}/technical-notes`, {
        diagnosis: diagnosis.trim(),
        solution: solution.trim(),
      });
      await loadTicket();
      showToast('Diagnóstico y solución técnica guardados.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al guardar notas técnicas.', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const openAssignModal = async () => {
    if (!ticket) return;
    try {
      const res = await api.get<{
        success: boolean;
        data: { technicians: TechnicianWorkload[] };
      }>('/api/technicians');
      const activeTechs = res.data.technicians.filter((t) => t.isUserActive);
      setTechnicians(activeTechs);
      setSelectedTechId(
        ticket.assignedTechnician ? String(ticket.assignedTechnician.id) : String(activeTechs[0]?.technicianId || '')
      );
      setAssignReason('');
      setAssignModalOpen(true);
    } catch (err: any) {
      showToast(err.message || 'No se pudo cargar la lista de técnicos.', 'error');
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !selectedTechId) return;
    setAssigning(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/api/tickets/${ticket.id}/assign`,
        {
          technicianId: Number(selectedTechId),
          reason: assignReason.trim() || undefined,
        }
      );
      setAssignModalOpen(false);
      await loadTicket();
      showToast(res.message, 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo asignar el técnico.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || commentText.trim().length < 2) return;
    setSendingComment(true);
    try {
      await api.post(`/api/tickets/${ticket.id}/comments`, {
        content: commentText.trim(),
        isInternal: isInternalComment,
      });
      setCommentText('');
      setIsInternalComment(false);
      await loadTicket();
      showToast('Comentario registrado.', 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo enviar el comentario.', 'error');
    } finally {
      setSendingComment(false);
    }
  };

  const handleUploadMoreAttachments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ticket || !e.target.files || e.target.files.length === 0) return;
    const selected = Array.from(e.target.files).slice(0, 4);
    const formData = new FormData();
    for (const f of selected) {
      formData.append('attachments', f);
    }
    e.target.value = '';
    setUploadingFiles(true);
    try {
      await api.post(`/api/tickets/${ticket.id}/attachments`, formData);
      await loadTicket();
      showToast('Evidencia(s) adjuntada(s) correctamente.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al subir archivo adjunto.', 'error');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDownloadAttachment = async (downloadUrl: string, originalName: string) => {
    try {
      await api.downloadBlob(downloadUrl, originalName);
    } catch (err: any) {
      showToast(err.message || 'Error al descargar adjunto.', 'error');
    }
  };

  if (loading && !ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
        <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Cargando expediente de incidencia...</p>
      </div>
    );
  }

  if (!ticket || !user) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
        <p className="text-sm font-bold text-slate-800">No se encontró la incidencia o no tiene acceso a ella.</p>
        <Link to="/tickets" className="text-xs font-semibold text-blue-600 hover:underline">
          ← Volver al listado de incidencias
        </Link>
      </div>
    );
  }

  const canInteractOnTicket =
    user.role === 'ADMIN' ||
    (user.role === 'COLABORADOR' && ticket.reporter.id === user.id) ||
    (user.role === 'TECNICO' && ticket.assignedTechnician?.id === user.technicianId);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Navegación y Acciones Principales */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <Link
            to="/tickets"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al listado
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-lg font-extrabold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-0.5">
              {ticket.code}
            </span>
            <StatusBadge status={ticket.status} size="md" />
            <PriorityBadge priority={ticket.priority} />
            <CategoryBadge code={ticket.category.code} name={ticket.category.name} />
          </div>
          <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
            {ticket.subject}
          </h1>
        </div>

        {/* Botonera Operativa según Rol y Estado */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {user.role === 'ADMIN' && ticket.status !== 'RESUELTO' && (
            <button
              type="button"
              onClick={openAssignModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
            >
              <UserCheck className="h-4 w-4 text-blue-600" />
              {ticket.assignedTechnician ? 'Reasignar Técnico' : 'Asignar Técnico'}
            </button>
          )}

          {canManageTechnical && ticket.status === 'PENDIENTE' && (
            <button
              type="button"
              onClick={() => openStatusModal('EN_PROCESO')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
            >
              <PlayCircle className="h-4 w-4" />
              Iniciar Atención (En Proceso)
            </button>
          )}

          {canManageTechnical && (ticket.status === 'PENDIENTE' || ticket.status === 'EN_PROCESO') && (
            <button
              type="button"
              onClick={() => openStatusModal('RESUELTO')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              Marcar como Resuelto
            </button>
          )}

          {canManageTechnical && ticket.status === 'RESUELTO' && (
            <button
              type="button"
              onClick={() => openStatusModal('EN_PROCESO')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Reabrir Atención
            </button>
          )}
        </div>
      </div>

      {/* Cinta de Indicadores SLA del Ticket */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Fecha de Registro</p>
          <p className="mt-1 text-xs sm:text-sm font-bold text-slate-900">{formatDateTime(ticket.createdAt)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">KPI 1: 1ra Respuesta</p>
          <p className="mt-1 text-xs sm:text-sm font-bold text-indigo-700">
            {ticket.firstResponseMinutes !== null
              ? `${formatDurationMinutes(ticket.firstResponseMinutes)} (Meta ≤ ${ticket.category.slaResponseMinutes}m)`
              : 'Pendiente de 1ra atención'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">
            {ticket.status === 'RESUELTO' ? 'Tiempo hasta Resolución' : 'Tiempo Transcurrido'}
          </p>
          <p className="mt-1 text-xs sm:text-sm font-bold text-slate-900">
            {formatDurationMinutes(
              ticket.status === 'RESUELTO' ? ticket.resolutionMinutes : ticket.elapsedMinutes
            )}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Estación / Anexo BPO</p>
          <p className="mt-1 text-xs sm:text-sm font-mono font-bold text-slate-900 flex items-center gap-1.5">
            <Monitor className="h-4 w-4 text-slate-400" />
            {ticket.workstationCode || 'No especificado'}
          </p>
        </div>
      </div>

      {/* Diseño de 2 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Principal (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Descripción de la Incidencia */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Descripción Detallada del Problema</h2>
              <span className="text-xs font-medium text-slate-500">{ticket.incidentType}</span>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{ticket.description}</p>
          </div>

          {/* Diagnóstico Técnico y Solución Aplicada */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Diagnóstico Técnico y Solución Aplicada
                </h2>
              </div>
              {canManageTechnical && (
                <button
                  type="button"
                  disabled={savingNotes}
                  onClick={handleSaveTechnicalNotes}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingNotes ? 'Guardando...' : 'Guardar Avance Técnico'}
                </button>
              )}
            </div>

            {canManageTechnical ? (
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Diagnóstico Técnico de la Causa Raíz
                  </label>
                  <textarea
                    rows={3}
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Documente el análisis técnico y causa identificada del incidente..."
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Procedimiento y Solución Aplicada
                  </label>
                  <textarea
                    rows={3}
                    value={solution}
                    onChange={(e) => setSolution(e.target.value)}
                    placeholder="Documente las acciones correctivas efectuadas para restablecer el servicio..."
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4">
                  <p className="text-xs font-bold text-slate-700 mb-1">Diagnóstico Técnico</p>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                    {ticket.diagnosis || 'En proceso de evaluación por el especialista de Soporte TI.'}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50/50 border border-emerald-200/70 p-4">
                  <p className="text-xs font-bold text-emerald-900 mb-1">Solución Aplicada</p>
                  <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-line">
                    {ticket.solution || 'Se registrará al culminar la atención técnica.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Evidencias y Archivos Adjuntos */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-slate-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Evidencias y Archivos Adjuntos ({ticket.attachments.length})
                </h2>
              </div>
              {canInteractOnTicket && (
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <FileUp className="h-3.5 w-3.5 text-blue-600" />
                  {uploadingFiles ? 'Subiendo...' : 'Adjuntar Evidencia'}
                  <input
                    type="file"
                    multiple
                    disabled={uploadingFiles}
                    accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.log,.doc,.docx,.xls,.xlsx"
                    onChange={handleUploadMoreAttachments}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {ticket.attachments.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                No se han adjuntado capturas ni documentos en esta incidencia.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ticket.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{att.originalName}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatBytes(att.sizeBytes)} • Por {att.uploadedByName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadAttachment(att.downloadUrl, att.originalName)}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-blue-600 hover:bg-blue-50 transition shrink-0 cursor-pointer"
                      title="Descargar archivo"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comentarios y Seguimiento */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Comentarios y Observaciones ({ticket.comments.length})
              </h2>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {ticket.comments.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">
                  Aún no hay comentarios registrados en la conversación.
                </p>
              ) : (
                ticket.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-xl border p-3.5 ${
                      c.isInternal
                        ? 'border-amber-200 bg-amber-50/60'
                        : c.author.role !== 'COLABORADOR'
                        ? 'border-blue-100 bg-blue-50/40'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{c.author.fullName}</span>
                        <span className="rounded bg-white border border-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                          {c.author.roleName}
                        </span>
                        {c.isInternal && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                            <Lock className="h-2.5 w-2.5" /> Nota Interna TI
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            {canInteractOnTicket && (
              <form onSubmit={handleAddComment} className="pt-2 border-t border-slate-100 space-y-3">
                <textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Escriba un comentario, avance o consulta sobre este ticket..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {user.role !== 'COLABORADOR' ? (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternalComment}
                        onChange={(e) => setIsInternalComment(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span>Registrar como nota técnica interna (no visible al colaborador)</span>
                    </label>
                  ) : (
                    <span />
                  )}

                  <button
                    type="submit"
                    disabled={sendingComment || commentText.trim().length < 2}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-4 py-2 text-xs font-bold text-white hover:bg-konectar-800 disabled:opacity-50 transition cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendingComment ? 'Enviando...' : 'Publicar Comentario'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Columna Lateral Derecha: Datos de Colaborador, Técnico e Historial Inmutable (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Ficha del Colaborador */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Datos del Colaborador Solicitante
            </h3>
            <div>
              <p className="text-sm font-bold text-slate-900">{ticket.reporter.fullName}</p>
              <p className="text-xs text-slate-500 font-mono">{ticket.reporter.employeeCode}</p>
            </div>
            <div className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-2.5">
              <p>
                <strong>Área:</strong> {ticket.department.name}
              </p>
              <p>
                <strong>Sede:</strong> {ticket.department.site}
              </p>
              <p>
                <strong>Correo:</strong> {ticket.reporter.email}
              </p>
              {ticket.reporter.phone && (
                <p>
                  <strong>Teléfono:</strong> {ticket.reporter.phone}
                </p>
              )}
            </div>
          </div>

          {/* Ficha del Técnico Responsable */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Especialista TI Responsable
              </h3>
              <Wrench className="h-4 w-4 text-blue-600" />
            </div>
            {ticket.assignedTechnician ? (
              <>
                <div>
                  <p className="text-sm font-bold text-slate-900">{ticket.assignedTechnician.fullName}</p>
                  <p className="text-xs text-blue-700 font-medium">
                    Nivel {ticket.assignedTechnician.supportLevel} • {ticket.assignedTechnician.specialty}
                  </p>
                </div>
                <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">
                  {ticket.assignedTechnician.email}
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Esta incidencia se encuentra pendiente de asignación a un técnico de Soporte TI.
              </div>
            )}
          </div>

          {/* Historial Inmutable de Estados */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <History className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Historial Auditable de Estados</h3>
            </div>

            <ol className="relative border-l-2 border-slate-200 ml-2.5 space-y-5">
              {ticket.statusHistory.map((h) => (
                <li key={h.id} className="ml-5">
                  <span
                    className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                      h.newStatus === 'RESUELTO'
                        ? 'bg-emerald-500'
                        : h.newStatus === 'EN_PROCESO'
                        ? 'bg-blue-600'
                        : 'bg-amber-500'
                    }`}
                  />
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-900">
                    {h.previousStatus ? (
                      <>
                        <span className="text-slate-500">{h.previousStatus}</span>
                        <span>→</span>
                        <span>{h.newStatus}</span>
                      </>
                    ) : (
                      <span>REGISTRADO ({h.newStatus})</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-snug">{h.comment}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {h.changedBy.fullName} ({h.changedBy.roleName}) • {formatDateTime(h.createdAt)}
                  </p>
                </li>
              ))}
            </ol>

            {ticket.assignmentHistory.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <p className="text-[11px] font-bold uppercase text-slate-400">Registro de Asignaciones</p>
                {ticket.assignmentHistory.map((a) => (
                  <div key={a.id} className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800">{a.assignmentMode}:</span>{' '}
                    {a.previousTechnicianName ? `${a.previousTechnicianName} → ` : ''}
                    <strong>{a.technicianName}</strong>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Por {a.assignedByName} • {formatDateTime(a.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Actualización de Estado */}
      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`Actualizar Estado a: ${
          targetStatus === 'EN_PROCESO' ? 'En Proceso' : targetStatus === 'RESUELTO' ? 'Resuelto' : 'Pendiente'
        }`}
        subtitle={`Incidencia ${ticket.code} • Se registrará en el historial auditable`}
      >
        <form onSubmit={handleConfirmStatusChange} className="space-y-4">
          {targetStatus === 'RESUELTO' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Diagnóstico Técnico *
                </label>
                <textarea
                  rows={2}
                  required
                  value={modalDiagnosis}
                  onChange={(e) => setModalDiagnosis(e.target.value)}
                  placeholder="Describa la causa técnica identificada..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Solución Aplicada *
                </label>
                <textarea
                  rows={2}
                  required
                  value={modalSolution}
                  onChange={(e) => setModalSolution(e.target.value)}
                  placeholder="Describa el procedimiento realizado para resolver la incidencia..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Comentario u Observación del Cambio de Estado *
            </label>
            <textarea
              rows={3}
              required
              value={statusComment}
              onChange={(e) => setStatusComment(e.target.value)}
              placeholder="Ingrese el detalle u observación que acompañará este cambio de estado..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setStatusModalOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updatingStatus}
              className="rounded-xl bg-konectar-700 px-5 py-2 text-xs font-bold text-white hover:bg-konectar-800 disabled:opacity-50 cursor-pointer"
            >
              {updatingStatus ? 'Actualizando...' : 'Confirmar Cambio de Estado'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal de Asignación / Reasignación Manual (ADMIN) */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={ticket.assignedTechnician ? 'Reasignar Especialista TI' : 'Asignar Especialista TI'}
        subtitle={`Seleccione el técnico responsable considerando su especialidad y carga actual`}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {technicians.map((t) => {
              const selected = String(t.technicianId) === selectedTechId;
              return (
                <label
                  key={t.technicianId}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 cursor-pointer transition ${
                    selected
                      ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="tech"
                      value={t.technicianId}
                      checked={selected}
                      onChange={(e) => setSelectedTechId(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {t.fullName}{' '}
                        <span className="text-[10px] font-semibold text-slate-500">({t.supportLevel})</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{t.specialty}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        t.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {t.isAvailable ? 'Disponible' : 'Ocupado'}
                    </span>
                    <p className="text-[11px] font-bold text-slate-700 mt-0.5">
                      Carga: {t.activeLoad}/{t.maxConcurrentTickets}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Motivo u Observación de Asignación
            </label>
            <input
              type="text"
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              placeholder="Ej. Especialista de guardia en redes / Balanceo de carga operativa"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setAssignModalOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={assigning || !selectedTechId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-konectar-700 px-5 py-2 text-xs font-bold text-white hover:bg-konectar-800 disabled:opacity-50 cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5 hidden" />
              {assigning ? 'Asignando...' : 'Confirmar Asignación'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
