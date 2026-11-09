using AbstractMCMC, Random, Test, Logging
struct ProbeModel <: AbstractMCMC.AbstractModel end
struct ProbeSampler <: AbstractMCMC.AbstractSampler end
const STEP_CALLS = Ref(0)
function AbstractMCMC.step(rng::AbstractRNG, ::ProbeModel, ::ProbeSampler, state::Integer=0; initial_params=nothing, kwargs...)
    STEP_CALLS[] += 1
    value = state == 0 && initial_params !== nothing ? initial_params.a : state + 1
    return value, state + 1
end
expected = ENV["REVIEW_REVISION"] == "base" ? MethodError : ArgumentError
println("Julia=", VERSION)
println("Project=", Base.active_project())
println("Package=", pathof(AbstractMCMC))
println("Threads=", Threads.nthreads(), ", workers=", AbstractMCMC.Distributed.nworkers())
println("Fallback params exists=", hasmethod(AbstractMCMC.check_initial_params, Tuple{NamedTuple{(:a,:b),Tuple{Float64,Float64}},Int}))
println("Fallback state exists=", hasmethod(AbstractMCMC.check_initial_state, Tuple{Int,Int}))
@testset "invalid public sample calls" begin
    for mode in (MCMCSerial(), MCMCThreads(), MCMCDistributed())
        for (key, value) in ((:initial_params, (a=1.0,b=2.0)), (:initial_state, 10))
            kwargs = NamedTuple{(key,)}((value,))
            err = try
                with_logger(NullLogger()) do
                    sample(MersenneTwister(42), ProbeModel(), ProbeSampler(), mode, 3, 4; progress=false, kwargs...)
                end
                nothing
            catch e
                e
            end
            println(typeof(mode), " ", key, " => ", typeof(err), ": ", sprint(showerror, err))
            @test err isa expected
            @test STEP_CALLS[] == 0
        end
    end
end
@testset "serial controls" begin
    for key in (:initial_params, :initial_state)
        kwargs = NamedTuple{(key,)}(([1],))
        @test_throws ArgumentError sample(MersenneTwister(42), ProbeModel(), ProbeSampler(), MCMCSerial(), 3, 2; progress=false, kwargs...)
    end
    chains = sample(MersenneTwister(42), ProbeModel(), ProbeSampler(), MCMCSerial(), 3, 2; progress=false)
    @test chains == [[1,2,3], [1,2,3]]
    chains = sample(MersenneTwister(42), ProbeModel(), ProbeSampler(), MCMCSerial(), 3, 2; progress=false, initial_params=[(a=7,), (a=8,)])
    @test chains == [[7,2,3], [8,2,3]]
    chains = sample(MersenneTwister(42), ProbeModel(), ProbeSampler(), MCMCSerial(), 3, 2; progress=false, initial_state=[10,20])
    @test chains == [[11,12,13], [21,22,23]]
    println("Controls: wrong lengths rejected, nothing accepted, matching params and states consumed by each chain")
end
