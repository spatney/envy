import { Page } from '../components/ui/Page';
import { ButtonLink, GradientText } from '../components/ui/primitives';

export function NotFound() {
  return (
    <Page>
      <div className="mx-auto max-w-lg py-20 text-center">
        <div className="font-display text-7xl font-bold tracking-tight">
          <GradientText>404</GradientText>
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold text-text">Page Not Found</h1>
        <p className="mt-2 text-muted">This route is not registered in the gallery. Return to the overview or chart catalog.</p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink to="/">Home</ButtonLink>
          <ButtonLink to="/charts" variant="outline">
            Browse Chart Catalog
          </ButtonLink>
        </div>
      </div>
    </Page>
  );
}
