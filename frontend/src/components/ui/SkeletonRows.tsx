/** Placeholder table rows shown while a table's data loads. */
export const SkeletonRows = ({ rows = 4, columns }: { rows?: number; columns: number }) => (
  <>
    {Array.from({ length: rows }, (_, row) => (
      <tr key={row} aria-hidden="true">
        {Array.from({ length: columns }, (_, col) => (
          <td key={col} className="px-4 py-4">
            <div className={`skeleton h-3.5 ${col === 0 ? 'w-3/4' : 'w-1/2'}`} />
          </td>
        ))}
      </tr>
    ))}
  </>
);
