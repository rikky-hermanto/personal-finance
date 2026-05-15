import { useCallback } from 'react';
import FileUpload from '@/components/FileUpload';
import PageHeader from '@/components/PageHeader';

const UploadTab = () => {
  const handleFileUpload = useCallback((files: File[]) => {
    console.log('Files uploaded:', files.map((f) => f.name));
  }, []);

  return (
    <div className="p-8 bg-transparent min-h-full">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Upload Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">Import your bank statements and transaction files</p>
        </div>
        <div className="mt-[15vh]">
          <FileUpload onFileUpload={handleFileUpload} />
        </div>
      </div>
    </div>
  );
};

export default UploadTab;
