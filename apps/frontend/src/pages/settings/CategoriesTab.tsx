import CategoryManager from '@/components/CategoryManager';

const CategoriesTab = () => (
  <div className="p-8 bg-transparent min-h-full">
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Category Rules</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Keywords matched case-insensitively against transaction descriptions
        </p>
      </div>
      <CategoryManager />
    </div>
  </div>
);

export default CategoriesTab;
