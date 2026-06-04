# syntax=docker/dockerfile:1.7
# Teams Media Bot sidecar — .NET 8 ASP.NET Core
#
# Provides the Graph API control plane (join / leave / modality management)
# and an FFmpeg-based video relay pipeline for Teams native screen share.
#
# Stages:
#   build   — restore NuGet packages, publish release build
#   runtime — lean ASP.NET 8 runtime + ffmpeg for the video relay

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore separately so the layer is cached when only source changes
COPY TeamsMediaBot.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# ffmpeg — required by VideoInjectorService for the HLS → RTP relay pipeline
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

EXPOSE 8090

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
    CMD wget -qO- http://localhost:8090/health || exit 1

ENTRYPOINT ["dotnet", "TeamsMediaBot.dll"]
