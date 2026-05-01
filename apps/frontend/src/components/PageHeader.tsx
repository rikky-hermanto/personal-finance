interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

const PageHeader = ({ title, subtitle }: PageHeaderProps) => (
  <div className="mb-6">
    <h1 className="text-xl font-semibold text-foreground">{title}</h1>
    {subtitle && (
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    )}
  </div>
);

export default PageHeader;
