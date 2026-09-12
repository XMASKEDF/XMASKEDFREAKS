"use client";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function PaginationControls({ page, pageSize, totalItems, onPageChange, onPageSizeChange }: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= 10 && pageSize === 10) return null;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 7);
  return <div className="catalog-pagination" aria-label="Product pagination"><label>SHOW:<select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><nav><button className="secondary" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">PREV</button>{pages.map((item) => <button className={item === page ? "primary" : "secondary"} type="button" key={item} onClick={() => onPageChange(item)} aria-current={item === page ? "page" : undefined}>{item}</button>)}<button className="secondary" type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>NEXT</button></nav><span>{totalItems} items</span></div>;
}
