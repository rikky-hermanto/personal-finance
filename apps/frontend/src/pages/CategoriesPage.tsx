import CategoryManager from '@/components/CategoryManager';

const CategoriesPage = () => (
  <div className="p-8 bg-background min-h-full">
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Categories</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Keywords matched case-insensitively against transaction descriptions
        </p>
      </div>
      <CategoryManager />
    </div>
  </div>
);

export default CategoriesPage;
