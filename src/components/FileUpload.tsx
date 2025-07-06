import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, Eye, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Transaction } from '@/types/Transaction';
import { parseTransactionFiles } from '@/utils/transactionParser';
import TransactionPreview from './TransactionPreview';
import * as transactionsApi from '@/api/transactionsApi';

interface FileUploadProps {
  onFileUpload: (files: File[]) => void;
}

type WorkflowStep = 'upload' | 'review' | 'preview' | 'submitted';

const FileUpload = ({ onFileUpload }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [parsedTransactions, setParsedTransactions] = useState<Transaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfPassword, setPdfPassword] = useState<string>('');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => 
      file.type === 'text/csv' || 
      file.type === 'application/pdf' ||
      file.name.endsWith('.csv') || 
      file.name.endsWith('.pdf')
    );
    
    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles]);
      if (currentStep === 'upload') {
        setCurrentStep('review');
      }
    }
  }, [currentStep]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files]);
      if (currentStep === 'upload') {
        setCurrentStep('review');
      }
    }
  }, [currentStep]);

  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    if (uploadedFiles.length === 1) {
      setCurrentStep('upload');
    }
  }, [uploadedFiles.length]);

  const handleProcessFiles = useCallback(async () => {
    setIsProcessing(true);
    try {
      // Only process the first file for now (API expects one file per request)
      const file = uploadedFiles[0];
      if (!file) return;

      // Call the actual API for upload-preview
      const apiTransactions = await transactionsApi.uploadPreview(file, pdfPassword);
      // Map API response to your Transaction type with proper type casting
      const transactions: Transaction[] = apiTransactions.map((t: transactionsApi.TransactionDto) => ({
        id: t.id.toString(),
        date: t.date,
        description: t.description,
        amount: t.flow === 'CR' ? Number(t.amountIdr) : -Number(t.amountIdr),
        type: (t.type.toLowerCase() === 'income' ? 'income' : 'expense') as 'income' | 'expense',
        category: t.category,
        bank: t.wallet,
        balance: t.balance,
      }));
      setParsedTransactions(transactions);
      setCurrentStep('preview');
    } catch (error) {
      console.error('Error processing files:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFiles, pdfPassword]);

  const handleConfirmData = useCallback((transactions: Transaction[]) => {
    onFileUpload(uploadedFiles);
    setCurrentStep('submitted');
  }, [uploadedFiles, onFileUpload]);

  const handleStartOver = useCallback(() => {
    setUploadedFiles([]);
    setParsedTransactions([]);
    setCurrentStep('upload');
  }, []);

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      <div className="flex items-center space-x-4">
        <div className={cn(
          "flex items-center space-x-2",
          currentStep === 'upload' ? "text-gray-900" : "text-gray-600"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'upload' ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300"
          )}>
            {currentStep === 'upload' ? '1' : <CheckCircle className="w-5 h-5" />}
          </div>
          <span className="text-sm font-medium">Upload</span>
        </div>
        
        <div className={cn(
          "w-8 h-1 rounded",
          currentStep === 'upload' ? "bg-gray-200" : "bg-gray-400"
        )} />
        
        <div className={cn(
          "flex items-center space-x-2",
          currentStep === 'upload' ? "text-gray-400" : 
          currentStep === 'review' ? "text-gray-900" : "text-gray-600"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'upload' ? "bg-white text-gray-400 border-gray-200" :
            currentStep === 'review' ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300"
          )}>
            {['preview', 'submitted'].includes(currentStep) ? <CheckCircle className="w-5 h-5" /> : '2'}
          </div>
          <span className="text-sm font-medium">Review</span>
        </div>
        
        <div className={cn(
          "w-8 h-1 rounded",
          ['preview', 'submitted'].includes(currentStep) ? "bg-gray-400" : "bg-gray-200"
        )} />
        
        <div className={cn(
          "flex items-center space-x-2",
          currentStep === 'preview' ? "text-gray-900" : 
          currentStep === 'submitted' ? "text-gray-600" : "text-gray-400"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'preview' ? "bg-gray-900 text-white border-gray-900" :
            currentStep === 'submitted' ? "bg-white text-gray-600 border-gray-300" : "bg-white text-gray-400 border-gray-200"
          )}>
            {currentStep === 'submitted' ? <CheckCircle className="w-5 h-5" /> : '3'}
          </div>
          <span className="text-sm font-medium">Preview</span>
        </div>
        
        <div className={cn(
          "w-8 h-1 rounded",
          currentStep === 'submitted' ? "bg-gray-400" : "bg-gray-200"
        )} />
        
        <div className={cn(
          "flex items-center space-x-2",
          currentStep === 'submitted' ? "text-gray-600" : "text-gray-400"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'submitted' ? "bg-white text-gray-600 border-gray-300" : "bg-white text-gray-400 border-gray-200"
          )}>
            {currentStep === 'submitted' ? <CheckCircle className="w-5 h-5" /> : '4'}
          </div>
          <span className="text-sm font-medium">Submit</span>
        </div>
      </div>
    </div>
  );

  if (currentStep === 'preview') {
    return (
      <>
        {renderStepIndicator()}
        <TransactionPreview
          transactions={parsedTransactions}
          onConfirm={handleConfirmData}
          onBack={() => setCurrentStep('review')}
        />
      </>
    );
  }

  if (currentStep === 'submitted') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        {renderStepIndicator()}
        
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Data Imported Successfully!</h2>
          <p className="text-gray-600 mb-6">
            Your {parsedTransactions.length} transaction{parsedTransactions.length > 1 ? 's have' : ' has'} been imported and categorized.
          </p>
          
          <Button onClick={handleStartOver} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
            Import More Files
          </Button>
        </div>
      </div>
    );
  }

  if (currentStep === 'review') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        {renderStepIndicator()}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Review Your Files</h2>
          <p className="text-gray-600">
            Please review the files below before processing them for data extraction.
          </p>
        </div>
        <div className="space-y-3 mb-6">
          {uploadedFiles.map((file, index) => (
            <div key={index} className="flex items-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <FileText className="w-5 h-5 text-gray-600 mr-3" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB • {file.type || 'Unknown type'}
                </p>
              </div>
              <button
                onClick={() => handleRemoveFile(index)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {uploadedFiles.some(f => f.name.toLowerCase().endsWith('.pdf')) && (
          <div className="mb-6">
            <input
              type="password"
              placeholder="PDF Password (if needed)"
              value={pdfPassword}
              onChange={e => setPdfPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        )}
        <div className="flex gap-4 justify-center">
          <Button onClick={() => setCurrentStep('upload')} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
            <Upload className="w-4 h-4 mr-2" />
            Add More Files
          </Button>
          <Button
            onClick={handleProcessFiles}
            className="bg-gray-900 hover:bg-gray-800 text-white"
            disabled={isProcessing || uploadedFiles.length === 0}
          >
            <Eye className="w-4 h-4 mr-2" />
            {isProcessing ? 'Processing...' : `Process Files (${uploadedFiles.length})`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {renderStepIndicator()}
      
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Upload Bank Statements</h2>
        <p className="text-gray-600">
          Drag and drop your CSV or PDF bank statements from BCA, NeoBank, Superbank, or Wise
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
          isDragging
            ? "border-gray-400 bg-gray-50"
            : "border-gray-300 hover:border-gray-400"
        )}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Drop files here or click to browse
        </h3>
        <p className="text-gray-500 mb-4">
          Supports CSV and PDF files up to 10MB
        </p>
        
        <input
          type="file"
          multiple
          accept=".csv,.pdf"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="inline-flex items-center px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4 mr-2" />
          Choose Files
        </label>
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="font-semibold text-gray-900">BCA</div>
          <div className="text-sm text-gray-500">CSV & PDF</div>
        </div>
        <div className="text-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="font-semibold text-gray-900">NeoBank</div>
          <div className="text-sm text-gray-500">CSV & PDF</div>
        </div>
        <div className="text-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="font-semibold text-gray-900">Superbank</div>
          <div className="text-sm text-gray-500">CSV & PDF</div>
        </div>
        <div className="text-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="font-semibold text-gray-900">Wise</div>
          <div className="text-sm text-gray-500">CSV & PDF</div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
