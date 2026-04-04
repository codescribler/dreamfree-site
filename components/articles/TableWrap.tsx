interface TableWrapProps {
  children: React.ReactNode;
}

export function TableWrap({ children }: TableWrapProps) {
  return (
    <div className="my-6 overflow-x-auto rounded-[10px] border border-border">
      {children}
    </div>
  );
}
