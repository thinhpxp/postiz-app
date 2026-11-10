import { IsOptional, IsString } from 'class-validator';

export class FacebookPersonalDto {
  @IsOptional()
  @IsString()
  audience?: 'public' | 'friends'; // Áp dụng cho Profile cá nhân

  @IsOptional()
  @IsString()
  post_as?: 'normal' | 'anonymous'; // Áp dụng cho Hội nhóm (đăng ẩn danh)
}

