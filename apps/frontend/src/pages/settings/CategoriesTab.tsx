import CategoryManager from '@/components/CategoryManager';

const CategoriesTab = () => (
  <div className="p-8 bg-background min-h-full">
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground">Category Rules</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Keywords matched case-insensitively against transaction descriptions
        </p>
      </div>
      <CategoryManager />
    </div>
  </div>
);

export default CategoriesTab;
