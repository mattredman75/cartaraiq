from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:password@localhost:3306/cartaraiq"
    jwt_secret: str = "changeme-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 30  # 30 days
    claude_api_key: str = ""
    groq_api_key: str = ""
    smtp_host: str = "mail.cartaraiq.app"
    smtp_port: int = 587
    smtp_user: str = "support@cartaraiq.app"
    smtp_pass: str = "support_123QWE!"
    smtp_from: str = "support@cartaraiq.app"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
