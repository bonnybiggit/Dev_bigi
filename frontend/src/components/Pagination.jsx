import { ChevronLeft, ChevronRight } from "lucide-react";
export default function Pagination({ page, total, limit = 10, onPage }) {
  return (
    <div className="pagination">
      <span>
        Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of{" "}
        {total}
      </span>
      <div>
        <button
          type="button"
          className="icon-button"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={19} />
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Next page"
          disabled={page * limit >= total}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={19} />
        </button>
      </div>
    </div>
  );
}
