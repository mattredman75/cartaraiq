from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:password@localhost:3306/cartaraiq"
    jwt_secret: str = "changeme-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 30  # 30 days
    claude_api_key: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
