from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:password@localhost:3306/cartaraiq"
    jwt_secret: str = "changeme-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 15  # 15 minutes (refresh token handles longevity)
    claude_api_key: str = ""
    groq_api_key: str = ""
    smtp_host: str = "mail.cartaraiq.app"
    smtp_port: int = 587
    smtp_user: str = "support@cartaraiq.app"
    smtp_pass: str = "support_123QWE!"
    smtp_from: str = "support@cartaraiq.app"
    google_ios_client_id: str = ""
    google_web_client_id: str = ""
    facebook_app_id: str = ""
    facebook_app_secret: str = ""
    fat_secret_client_id: str = ""
    fat_secret_api_secret: str = ""
    cors_extra_origins: str = ""
    app_base_url: str = "https://cartaraiq.app"
    # URL the server is reachable at for serving static files (avatars, uploads).
    server_url: str = "https://cartaraiq.app"
    # Web base URL used for Universal Link invite URLs — must always be https, never a custom scheme.
    web_base_url: str = "https://cartaraiq.app"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
