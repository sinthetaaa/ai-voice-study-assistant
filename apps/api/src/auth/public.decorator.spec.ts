import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('Public decorator', () => {
  const reflector = new Reflector();

  it('marks a controller public', () => {
    @Public()
    class PublicController {}

    expect(reflector.get<boolean>(IS_PUBLIC_KEY, PublicController)).toBe(true);
  });

  it('marks an individual handler public', () => {
    class TestController {
      @Public()
      route(this: void) {}
    }

    expect(
      reflector.get<boolean>(IS_PUBLIC_KEY, TestController.prototype.route),
    ).toBe(true);
  });
});
