import { validate } from 'class-validator';
import { CustomLinkDto } from './custom-link.dto';

describe('CustomLinkDto', () => {
  it('should validate text length and special chars', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'Valid Text';
    dto.url = 'https://example.com';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail for empty text', async () => {
    const dto = new CustomLinkDto();
    dto.text = '';
    dto.url = 'https://example.com';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('text');
  });

  it('should fail for text with HTML special characters', async () => {
    const dto = new CustomLinkDto();
    dto.text = '<script>alert("xss")</script>';
    dto.url = 'https://example.com';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('text');
    expect(errors[0].constraints).toHaveProperty('matches');
  });

  it('should fail for text with ampersand', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'Privacy & Terms';
    dto.url = 'https://example.com';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('text');
  });

  it('should fail for text longer than 100 characters', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'a'.repeat(101);
    dto.url = 'https://example.com';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('text');
    expect(errors[0].constraints).toHaveProperty('isLength');
  });

  it('should validate URL format with protocol requirement', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'Valid Link';
    dto.url = 'https://example.com';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail for URL without protocol', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'Invalid Link';
    dto.url = 'example.com';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('url');
    expect(errors[0].constraints).toHaveProperty('isUrl');
  });

  it('should fail for invalid URL format', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'Invalid Link';
    dto.url = 'not a url';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('url');
  });

  it('should accept http protocol', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'Valid Link';
    dto.url = 'http://example.com';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail for URL longer than 500 characters', async () => {
    const dto = new CustomLinkDto();
    dto.text = 'Long URL';
    dto.url = 'https://example.com/' + 'a'.repeat(500);

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('url');
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });
});
