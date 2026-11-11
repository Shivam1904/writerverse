import { IDEAS } from '../../../../config/lexicon';
import { PageHeader } from '../../../components/PageHeader';

export function BraindumpsHead() {
  return <PageHeader section="braindumps" eyebrow="Imagine · ideas" title={IDEAS.page} />;
}
