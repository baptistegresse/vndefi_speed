export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">VNDeFi</h1>
      </div>
      {children}
    </div>
  );
}
