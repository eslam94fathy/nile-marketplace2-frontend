import { formatRating, starFills, type StarFill } from '@nile/domain';
import { Star } from 'lucide-react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';

// Rating display (conventions §12.8): five stars, the average with one decimal and the count, "4.3 (12 reviews)";
// read as "Rated 4.3 out of 5 from 12 reviews". The stars are decorative (the text carries the value), so the
// gold accent is allowed on them. No hooks: Server Components render it.

export interface RatingStarsProps {
  /** The API's average (`"4.30"`), `null` without reviews. */
  readonly avg: string | null;
  readonly count: number;
  readonly className?: string;
}

const STAR = 'size-4 shrink-0';

function StarIcon({ fill }: { readonly fill: StarFill }) {
  if (fill === 'half') {
    return (
      <span className="relative inline-flex">
        <Star className={cn(STAR, 'text-slate-300')} />
        <span className="absolute inset-y-0 start-0 w-1/2 overflow-hidden">
          <Star className={cn(STAR, 'fill-nile-gold text-nile-gold')} />
        </span>
      </span>
    );
  }
  return <Star className={cn(STAR, fill === 'full' ? 'fill-nile-gold text-nile-gold' : 'text-slate-300')} />;
}

export function RatingStars({ avg, count, className }: RatingStarsProps) {
  if (avg === null || count === 0) {
    return <span className={cn('text-sm text-muted-foreground', className)}>{UI_COPY.noReviewsYet}</span>;
  }
  const value = formatRating(avg);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className="sr-only">{UI_COPY.ratedOutOf(value, count)}</span>
      <span aria-hidden="true" className="inline-flex items-center">
        {starFills(avg).map((fill, index) => (
          // Five fixed positions; the index is the star's identity.
          <StarIcon key={index} fill={fill} />
        ))}
      </span>
      <span aria-hidden="true">{UI_COPY.ratingShort(value, count)}</span>
    </span>
  );
}
