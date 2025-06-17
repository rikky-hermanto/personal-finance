
import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, Eye, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Transaction } from '@/types/Transaction';
import { parseTransactionFiles } from '@/utils/transactionParser';
import TransactionPreview from './TransactionPreview';

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
      const transactions = await parseTransactionFiles(uploadedFiles);
      setParsedTransactions(transactions);
      setCurrentStep('preview');
    } catch (error) {
      console.error('Error processing files:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFiles]);

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
          currentStep === 'upload' ? "text-slate-900" : "text-slate-600"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'upload' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"
          )}>
            {currentStep === 'upload' ? '1' : <CheckCircle className="w-5 h-5" />}
          </div>
          <span className="text-sm font-medium">Upload</span>
        </div>
        
        <div className={cn(
          "w-8 h-1 rounded",
          currentStep === 'upload' ? "bg-slate-200" : "bg-slate-400"
        )} />
        
        <div className={cn(
          "flex items-center space-x-2",
          currentStep === 'upload' ? "text-slate-400" : 
          currentStep === 'review' ? "text-slate-900" : "text-slate-600"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'upload' ? "bg-white text-slate-400 border-slate-200" :
            currentStep === 'review' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"
          )}>
            {['preview', 'submitted'].includes(currentStep) ? <CheckCircle className="w-5 h-5" /> : '2'}
          </div>
          <span className="text-sm font-medium">Review</span>
        </div>
        
        <div className={cn(
          "w-8 h-1 rounded",
          ['preview', 'submitted'].includes(currentStep) ? "bg-slate-400" : "bg-slate-200"
        )} />
        
        <div className={cn(
          "flex items-center space-x-2",
          currentStep === 'preview' ? "text-slate-900" : 
          currentStep === 'submitted' ? "text-slate-600" : "text-slate-400"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'preview' ? "bg-slate-900 text-white border-slate-900" :
            currentStep === 'submitted' ? "bg-white text-slate-600 border-slate-300" : "bg-white text-slate-400 border-slate-200"
          )}>
            {currentStep === 'submitted' ? <CheckCircle className="w-5 h-5" /> : '3'}
          </div>
          <span className="text-sm font-medium">Preview</span>
        </div>
        
        <div className={cn(
          "w-8 h-1 rounded",
          currentStep === 'submitted' ? "bg-slate-400" : "bg-slate-200"
        )} />
        
        <div className={cn(
          "flex items-center space-x-2",
          currentStep === 'submitted' ? "text-slate-600" : "text-slate-400"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border",
            currentStep === 'submitted' ? "bg-white text-slate-600 border-slate-300" : "bg-white text-slate-400 border-slate-200"
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
          <CheckCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Data Imported Successfully!</h2>
          <p className="text-slate-600 mb-6">
            Your {parsedTransactions.length} transaction{parsedTransactions.length > 1 ? 's have' : ' has'} been imported and categorized.
          </p>
          
          <Button onClick={handleStartOver} variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50">
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
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Review Your Files</h2>
          <p className="text-slate-600">
            Please review the files below before processing them for data extraction.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {uploadedFiles.map((file, index) => (
            <div key={index} className="flex items-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <FileText className="w-5 h-5 text-slate-600 mr-3" />
              <div className="flex-1">
                <p className="font-medium text-slate-900">{file.name}</p>
                <p className="text-sm text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB • {file.type || 'Unknown type'}
                </p>
              </div>
              <button
                onClick={() => handleRemoveFile(index)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-4 justify-center">
          <Button onClick={() => setCurrentStep('upload')} variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50">
            <Upload className="w-4 h-4 mr-2" />
            Add More Files
          </Button>
          
          <Button 
            onClick={handleProcessFiles} 
            className="bg-slate-900 hover:bg-slate-800 text-white"
            disabled={isProcessing}
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
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Upload Bank Statements</h2>
        <p className="text-slate-600">
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
            ? "border-slate-400 bg-slate-50"
            : "border-slate-300 hover:border-slate-400"
        )}
      >
        <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Drop files here or click to browse
        </h3>
        <p className="text-slate-500 mb-4">
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
          className="inline-flex items-center px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4 mr-2" />
          Choose Files
        </label>
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="font-semibold text-slate-900">BCA</div>
          <div className="text-sm text-slate-500">CSV & PDF</div>
        </div>
        <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="font-semibold text-slate-900">NeoBank</div>
          <div className="text-sm text-slate-500">CSV & PDF</div>
        </div>
        <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="font-semibold text-slate-900">Superbank</div>
          <div className="text-sm text-slate-500">CSV & PDF</div>
        </div>
        <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="font-semibold text-slate-900">Wise</div>
          <div className="text-sm text-slate-500">CSV & PDF</div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
