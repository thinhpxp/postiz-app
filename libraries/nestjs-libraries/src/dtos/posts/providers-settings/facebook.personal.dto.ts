import { IsOptional, IsString } from 'class-validator';

export class FacebookPersonalDto {
  @IsOptional()
  @IsString()
  audience?: 'public' | 'friends'; // Áp dụng cho Profile cá nhân

  @IsOptional()
  @IsString()
  post_as?: 'normal' | 'anonymous'; // Áp dụng cho Hội nhóm (đăng ẩn danh)

  @IsOptional()
  @IsString()
  post_type?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  text_format_preset_id?: string;
}

