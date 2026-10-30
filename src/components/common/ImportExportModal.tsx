import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  exportToCSV,
  getSampleTemplate,
  parseAndValidateCSV,
  ImportValidationReport
} from '../../services/exportImport';
import { storageService } from '../../services/storage';
import {
  FileSpreadsheet,
  Download,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Loader2,
  RefreshCw,
  Database
} from 'lucide-react';

interface ImportExecutionSummary {
  success: boolean;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  skippedRecords: { row: number; name: string; reason: string }[];
  failedRecords: { row: number; reason: string }[];
  errors: string[];
}

export const ImportExportModal: React.FC = () => {
  const { isImportExportOpen, closeImportExportModal, importExportModule, showToast, triggerRefresh } = useApp();
  const [activeTab, setActiveTab] = useState<'EXPORT' | 'IMPORT'>('EXPORT');
  const [uploadText, setUploadText] = useState('');
  const [report, setReport] = useState<ImportValidationReport | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportExecutionSummary | null>(null);

  if (!isImportExportOpen) return null;

  const handleDownloadTemplate = () => {
    const tmpl = getSampleTemplate(importExportModule);
    exportToCSV(`${importExportModule}_Template`, tmpl.headers, [tmpl.sampleRow]);
    showToast(`Sample CSV template downloaded for ${importExportModule}`, 'success');
  };

  const handleExportCurrent = () => {
    const tmpl = getSampleTemplate(importExportModule);
    let rows: (string | number)[][] = [];

    switch (importExportModule) {
      case 'Leads':
        rows = storageService.getLeads().map(l => [
          l.customerName,
          l.companyName || '',
          l.phone,
          l.email,
          l.address,
          l.city,
          l.solarCapacityKw,
          l.estimatedValue,
          l.source,
          l.status
        ]);
        break;
      case 'Customers':
        rows = storageService.getCustomers().map(c => [
          c.name,
          c.companyName || '',
          c.customerType,
          c.phone,
          c.email,
          c.siteAddress,
          c.city,
          c.gstNumber || '',
          c.sanctionedLoadKw || 0
        ]);
        break;
      case 'Employees':
        rows = storageService.getEmployees().map(e => [
          e.employeeCode,
          e.name,
          e.department,
          e.designation,
          e.phone,
          e.email,
          e.joiningDate,
          e.salaryMonthly
        ]);
        break;
      case 'Payments':
        rows = storageService.getPayments().map(p => [
          p.receiptNumber,
          p.customerName,
          p.milestone,
          p.amount,
          p.status,
          p.dueDate,
          p.paidDate || '',
          p.paymentMode || ''
        ]);
        break;
      case 'Expenses':
        rows = storageService.getExpenses().map(e => [
          e.expenseNumber,
          e.vendorName,
          e.category,
          e.amount,
          e.date,
          e.paymentMode,
          e.referenceNo,
          e.notes
        ]);
        break;
      case 'Projects':
        rows = storageService.getProjects().map(p => [
          p.projectCode,
          p.customerName,
          p.title,
          p.capacityKw,
          p.totalValue,
          p.status,
          p.startDate || '',
          p.expectedCompletionDate || '',
          p.siteAddress || '',
          p.city || ''
        ]);
        break;
      case 'Products':
        rows = storageService.getProducts().map(p => [
          p.sku,
          p.name,
          p.category,
          p.brand || '',
          p.model || '',
          p.unit,
          p.hsnCode,
          p.gstRate,
          p.unitPrice,
          p.currentStock,
          p.minStockThreshold || p.reorderLevel || 10
        ]);
        break;
      case 'Vendors':
        rows = storageService.getVendors().map(v => [
          v.vendorCode,
          v.name,
          v.contactPerson || '',
          v.phone,
          v.email,
          v.address,
          v.city,
          v.state,
          v.gstNumber,
          v.paymentTerms
        ]);
        break;
      case 'Attendance':
        rows = storageService.getAttendance().map(a => [
          a.employeeName,
          a.attendanceDate || a.date || '',
          a.checkInTime || '09:00:00',
          a.checkOutTime || '18:00:00',
          a.status,
          a.siteLocation || a.siteProjectTitle || ''
        ]);
        break;
      case 'Service':
        rows = storageService.getServiceTickets().map(s => [
          s.ticketId || s.ticketNumber || '',
          s.customerName,
          s.issue || s.title || '',
          s.category,
          s.priority,
          s.status
        ]);
        break;
      default:
        rows = [tmpl.sampleRow];
    }

    exportToCSV(`${importExportModule}_Export_${new Date().toISOString().slice(0, 10)}`, tmpl.headers, rows);
    showToast(`Exported ${rows.length} rows of ${importExportModule}`, 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setUploadText(content);
      const validationReport = parseAndValidateCSV(content, importExportModule);
      setReport(validationReport);
    };
    reader.readAsText(file);
  };

  const handleApplyImport = async () => {
    if (!report || report.successful === 0) return;
    setIsImporting(true);
    setImportResult(null);

    try {
      if (importExportModule === 'Customers') {
        const result = await storageService.importCustomers(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} customer(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No customer records were imported.', 'error');
        }
      } else if (importExportModule === 'Projects') {
        const result = await storageService.importProjects(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} project(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No project records were imported.', 'error');
        }
      } else if (importExportModule === 'Leads') {
        const result = await storageService.importLeads(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} lead(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No lead records were imported.', 'error');
        }
      } else if (importExportModule === 'Employees') {
        const result = await storageService.importEmployees(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} employee(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No employee records were imported.', 'error');
        }
      } else if (importExportModule === 'Products') {
        const result = await storageService.importProducts(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} product(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No product records were imported.', 'error');
        }
      } else if (importExportModule === 'Vendors') {
        const result = await storageService.importVendors(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} vendor(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No vendor records were imported.', 'error');
        }
      } else if (importExportModule === 'Payments') {
        const result = await storageService.importPayments(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} payment(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No payment records were imported.', 'error');
        }
      } else if (importExportModule === 'Expenses') {
        const result = await storageService.importExpenses(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} expense(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No expense records were imported.', 'error');
        }
      } else if (importExportModule === 'Attendance') {
        const result = await storageService.importAttendance(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} attendance record(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No attendance records were imported.', 'error');
        }
      } else if (importExportModule === 'Service') {
        const result = await storageService.importServiceTickets(report.validRecords);
        const summary: ImportExecutionSummary = {
          success: result.success,
          total: report.totalRows,
          imported: result.imported,
          skipped: (result.skipped ?? 0) + (report.skipped ?? 0),
          failed: (result.failed ?? 0) + (report.failed ?? 0),
          skippedRecords: [
            ...(report.skippedRecords || []),
            ...(result.skippedRecords || [])
          ],
          failedRecords: [
            ...(report.failedRecords || []),
            ...(result.failedRecords || [])
          ],
          errors: [...(report.errors || []), ...(result.errors || [])]
        };
        setImportResult(summary);

        if (result.imported > 0) {
          showToast(`Successfully saved ${result.imported} service ticket(s) to MySQL!`, 'success');
          triggerRefresh();
        } else if (summary.skipped > 0) {
          showToast(`0 records imported: ${summary.skipped} skipped as duplicates.`, 'info');
        } else {
          showToast('No service ticket records were imported.', 'error');
        }
      }
    } catch (err: any) {
      console.error('Import failed:', err);
      setImportResult({
        success: false,
        total: report.totalRows,
        imported: 0,
        skipped: report.skipped || 0,
        failed: report.validRecords.length + (report.failed || 0),
        skippedRecords: report.skippedRecords || [],
        failedRecords: [{ row: 0, reason: err.message || 'Database write error' }],
        errors: [err.message || 'Database persistence error']
      });
      showToast(`Database write failed: ${err.message || err}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const resetImportState = () => {
    setReport(null);
    setImportResult(null);
    setUploadText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Excel / CSV Hub: {importExportModule}</h3>
              <p className="text-xs text-slate-500">Persistent MySQL schema validation & bulk ingestion</p>
            </div>
          </div>
          <button
            onClick={closeImportExportModal}
            className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 px-5 pt-3 bg-slate-50/50">
          <button
            onClick={() => {
              setActiveTab('EXPORT');
              resetImportState();
            }}
            className={`pb-2.5 px-4 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'EXPORT'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Export to Excel / CSV
          </button>
          <button
            onClick={() => setActiveTab('IMPORT')}
            className={`pb-2.5 px-4 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'IMPORT'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Import CSV with MySQL Validation
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {activeTab === 'EXPORT' ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                Download a complete, formatted spreadsheet of all {importExportModule} registered in the system.
                The CSV file is fully compatible with Microsoft Excel, Google Sheets, and LibreOffice.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleExportCurrent}
                  className="flex items-center justify-center gap-2 p-4 border border-amber-300 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs transition-colors shadow-sm cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Full {importExportModule} (.CSV)</span>
                </button>

                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center justify-center gap-2 p-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs transition-colors shadow-2xs cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>Download Blank Template</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* After Import Result View */}
              {importResult ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className={`p-4 rounded-xl border ${
                    importResult.imported > 0
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : importResult.skipped > 0
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-rose-50/70 border-rose-200'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      {importResult.imported > 0 ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : importResult.skipped > 0 ? (
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <h4 className="font-bold text-xs text-slate-900">
                          {importResult.imported > 0
                            ? 'Database Import Completed & Verified in MySQL'
                            : importResult.skipped > 0
                            ? 'Import Completed: All Records Skipped as Duplicates'
                            : 'Import Failed: Errors Encountered'}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {importResult.imported} added, {importResult.skipped} skipped, {importResult.failed} failed out of {importResult.total} total rows.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Metric Chips */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="block text-lg font-black text-emerald-700">{importResult.imported}</span>
                      <span className="text-[11px] font-semibold text-emerald-800">Saved to MySQL</span>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <span className="block text-lg font-black text-amber-700">{importResult.skipped}</span>
                      <span className="text-[11px] font-semibold text-amber-800">Skipped (Dup)</span>
                    </div>
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                      <span className="block text-lg font-black text-rose-700">{importResult.failed}</span>
                      <span className="text-[11px] font-semibold text-rose-800">Failed</span>
                    </div>
                  </div>

                  {/* Skipped Details */}
                  {importResult.skippedRecords.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                        Skipped Duplicate Records ({importResult.skippedRecords.length})
                      </span>
                      <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-amber-50/50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                        {importResult.skippedRecords.map((s, i) => (
                          <div key={i} className="flex items-start gap-1.5 py-0.5">
                            <span className="font-bold text-amber-700 shrink-0">Row {s.row}:</span>
                            <span>{s.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Failed Details */}
                  {importResult.failedRecords.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                        Failed Rows ({importResult.failedRecords.length})
                      </span>
                      <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-rose-50/50 border border-rose-200 rounded-lg text-[11px] text-rose-900">
                        {importResult.failedRecords.map((f, i) => (
                          <div key={i} className="flex items-start gap-1.5 py-0.5">
                            <span className="font-bold text-rose-700 shrink-0">Row {f.row}:</span>
                            <span>{f.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={() => {
                        triggerRefresh();
                        closeImportExportModal();
                      }}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
                    >
                      Done & View {importExportModule}
                    </button>
                    <button
                      onClick={resetImportState}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Import Another File
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">1. Download sample template to verify column mapping:</span>
                    <button
                      onClick={handleDownloadTemplate}
                      className="text-amber-700 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      Template
                    </button>
                  </div>

                  {/* Upload Dropzone */}
                  <div className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl p-6 text-center bg-slate-50/50 transition-colors">
                    <Upload className="w-8 h-8 mx-auto text-amber-500 mb-2" />
                    <p className="text-xs font-bold text-slate-700">Choose a CSV file to validate</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">UTF-8 comma-separated values (supports quoted strings)</p>
                    <label className="mt-3 inline-block px-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs">
                      Browse File
                      <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  {/* Validation Report */}
                  {report && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-amber-600" />
                          Pre-Import Verification ({report.totalRows} Rows)
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-800 font-bold">
                            {report.successful} Valid
                          </span>
                          {report.skipped > 0 && (
                            <span className="px-2 py-0.5 rounded-sm bg-amber-100 text-amber-800 font-bold">
                              {report.skipped} Duplicates
                            </span>
                          )}
                          {report.failed > 0 && (
                            <span className="px-2 py-0.5 rounded-sm bg-rose-100 text-rose-800 font-bold">
                              {report.failed} Failed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Warnings / Errors List */}
                      {report.errors.length > 0 ? (
                        <div className="max-h-32 overflow-y-auto space-y-1.5 p-2.5 bg-white border border-slate-200 rounded-lg text-[11px]">
                          {report.skippedRecords.map((s, i) => (
                            <div key={`s-${i}`} className="flex items-start gap-1.5 text-amber-800">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                              <span><strong>Row {s.row} (Skip Duplicate):</strong> {s.reason}</span>
                            </div>
                          ))}
                          {report.failedRecords.map((f, i) => (
                            <div key={`f-${i}`} className="flex items-start gap-1.5 text-rose-800">
                              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />
                              <span><strong>Row {f.row} (Invalid):</strong> {f.reason}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          All {report.totalRows} rows passed schema verification!
                        </div>
                      )}

                      {/* Action Button */}
                      {report.successful > 0 ? (
                        <button
                          onClick={handleApplyImport}
                          disabled={isImporting}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isImporting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Saving {report.successful} Records to MySQL Database...</span>
                            </>
                          ) : (
                            <>
                              <Database className="w-3.5 h-3.5" />
                              <span>Import {report.successful} Valid Rows to MySQL</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800 font-semibold">
                          No valid records to import. Please review skipped duplicate rows or invalid columns.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
